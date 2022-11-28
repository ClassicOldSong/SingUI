const TARGET_SYMBOL = Symbol('TARGET')
const emptyObj = Object.create(null)
const proxyMap = new WeakMap()
const R = Reflect

const prepareHooks = () => {
	let hooks = new Set()
	const runHooks = (...args) => hooks.forEach(hook => hook(...args))

	const addHooks = (...newHooks) => {
		for (let i of newHooks) hooks.add(i)

		let disconnected = false

		return () => {
			if (disconnected) return
			for (let i of newHooks) hooks.delete(i)
			disconnected = true
		}
	}

	return [runHooks, addHooks]
}

const useSignal = (initVal) => {
	let val = initVal

	const [runHooks, addHooks] = prepareHooks()

	const connect = (...handlers) => {
		if (handlers.length === 0) return val
		for (let i of handlers) i(val)
		return addHooks(...handlers)
	}

	const setVal = (newVal) => {
		if (val === newVal) return
		if (typeof newVal === 'function') newVal = newVal(val)
		const oldVal = val
		val = newVal
		runHooks(newVal, oldVal)
	}

	const signal = (newVal) => {
		// eslint-disable-next-line no-undefined
		if (newVal === undefined) return val
		return setVal(newVal)
	}

	signal.connect = connect

	return signal
}

const mux = (...args) => {
	const staticStrs = args.shift()
	const valList = new Array(staticStrs.length + args.length)

	let batchDepth = 0
	let handlerCount = 0
	let disconnectList = null
	let evalList = []

	for (let i in staticStrs) {
		valList[i * 2] = staticStrs[i]
	}

	const strMux = useSignal()

	const flush = () => {
		if (batchDepth <= 0) {
			for (let i of evalList) i()
			strMux(''.concat(...valList))
			batchDepth = 0
		}
	}

	const pause = () => {
		batchDepth += 1
	}

	const resume = () => {
		batchDepth -= 1
		if (batchDepth <= 0) flush()
	}

	const batch = (handler) => {
		pause()
		handler()
		resume()
	}

	const init = () => {
		if (disconnectList) return
		pause()
		disconnectList = args.map((signal, index) => {
			index = index * 2 + 1
			if (typeof signal === 'function') {
				evalList.push(() => {
					valList[index] = signal()
				})
				if (typeof signal.connect === 'function') return signal.connect(flush)
				return null
			}

			valList[index] = signal
			return null
		})
		resume()
	}

	const destroy = () => {
		if (!disconnectList) return
		for (let i of disconnectList) {
			if (i) i()
		}
		disconnectList = null
		evalList.length = 0
		handlerCount = 0
	}

	const cleanup = () => {
		handlerCount -= 1
		if (handlerCount <= 0) destroy()
	}

	const connect = (handler) => {
		if (!handler) return strMux()

		if (!disconnectList) init()

		handlerCount += 1

		const disconnectHandler = strMux.connect(handler)

		return () => {
			if (disconnectHandler()) {
				cleanup()
				return true
			}

			return false
		}
	}

	const disconnect = (handler) => {
		if (strMux.disconnect(handler)) cleanup()
	}

	let muxedSignal = null

	const watch = (...signals) => {
		if (!disconnectList) init()

		for (let i of signals) {
			disconnectList.push(i.connect(flush))
		}

		return muxedSignal
	}

	muxedSignal = (...args) => {
		if (!args.length) return strMux()
		return watch(...args)
	}

	muxedSignal.connect = connect
	muxedSignal.disconnect = disconnect
	muxedSignal.pause = pause
	muxedSignal.resume = resume
	muxedSignal.batch = batch
	muxedSignal.flush = flush
	muxedSignal.watch = watch

	return muxedSignal
}

const getCachedProxy = (target, lifeCycle) => {
	if (proxyMap.has(target)) {
		const lifeCycleMap = proxyMap.get(target)
		if (lifeCycleMap.has(lifeCycle)) return lifeCycleMap.get(lifeCycle)
	}

	return null
}

const proxify = (handler, target, lifeCycle) => {
	if (target) {
		let lifeCycleMap = null
		if (proxyMap.has(target)) {
			lifeCycleMap = proxyMap.get(target)
		} else {
			lifeCycleMap = new WeakMap()
			proxyMap.set(target, lifeCycleMap)
		}

		const proxied = new Proxy(target, handler)
		lifeCycleMap.set(lifeCycle, proxied)

		return proxied
	}

	return new Proxy(emptyObj, handler)
}

const unwrap = proxiedObj => R.get(proxiedObj, TARGET_SYMBOL) || proxiedObj

const wrapObj = (target, lifeCycle) => {
	const cachedProxy = getCachedProxy(target, lifeCycle)
	if (cachedProxy) return cachedProxy

	const targetObj = Object(target)
	if (targetObj !== target) return target

	const signalMap = {}

	const propProxy = proxify({
		get(_, propName) {
			if (propName === TARGET_SYMBOL) return target
			if (propName[0] === '$') {
				const realPropName = propName.substring(1)
				return (handler) => {
					if (handler) return val => R.set(propProxy, realPropName, handler(val, R.get(targetObj, realPropName), realPropName))
					return val => R.set(propProxy, realPropName, val)
				}
			}

			if (propName[0] === '_') {
				const realPropName = propName.substring(1)
				return (handler) => {
					if (handler) return () => handler(realPropName, propProxy)
					return () => wrapObj(R.get(target, realPropName), lifeCycle)
				}
			}

			return wrapObj(R.get(target, propName), lifeCycle)
		},
		set(_, propName, val) {
			if (propName[0] === '$' || propName[0] === '_') propName = propName.substring(1)

			if (signalMap[propName]) {
				if (val === signalMap[propName].signal) return true

				signalMap[propName].disconnect()
				delete signalMap[propName]
			}

			if (typeof val === 'function' && typeof val.connect === 'function') {

				let settedUp = false

				const setup = () => {
					if (settedUp) return

					const disconnect = val.connect(newVal => R.set(target, propName, newVal))
					const disconnectSelf = lifeCycle.onAfterDetatch(() => {
						disconnect()
						disconnectSelf()
						settedUp = false
					})

					settedUp = true
				}

				const disconnect = lifeCycle.onBeforeAttach(setup)

				signalMap[propName] = {
					signal: val,
					setup,
					disconnect
				}

				setTimeout(setup, 0)

				return true
			}

			return R.set(target, propName, val)
		},
		apply(_, thisArg, argList) {
			R.apply(target, unwrap(thisArg), argList)
		}
	}, targetObj, lifeCycle)

	return propProxy
}

const camelToKebab = str => [...str].map((i) => {
	const lowerCaseLetter = i.toLowerCase()
	if (i === lowerCaseLetter) return i
	return `-${lowerCaseLetter}`
}).join('')

const env = ({
	createElement,
	createTextNode,
	createComment,
	createDocumentFragment,
	cloneElement,
	appendChild,
	appendBefore,
	appendAfter,
	getNextSibling,
	getAttr,
	setAttr,
	removeAttr,
	addEventListener,
	removeEventListener
}, {
	tags = null,
	build = null,
	currentNode = null,
	currentNamespace = null,
	// hydrating = null,
	lifeCycleHooks = new WeakMap()
} = {}) => {

	const prevNodes = []
	const pushCurrentNode = (node) => {
		prevNodes.push(currentNode)
		currentNode = node
	}
	const popCurrentNode = () => {
		currentNode = prevNodes.pop()
	}

	const prevNamespaces = []
	const pushCurrentNamespace = (namespace) => {
		prevNamespaces.push(namespace)
		currentNamespace = namespace
	}
	const popCurrentNamespace = () => {
		currentNamespace = prevNamespaces.pop()
	}

	const scoped = (builder, node = currentNode) => {
		if (node === null) return builder
		return (...args) => {
			pushCurrentNode(node)
			const ret = builder(...args)
			popCurrentNode()
			return ret
		}
	}

	const namespaced = (builder, namespace = currentNamespace) => {
		if (namespace === null) return builder
		return (...args) => {
			pushCurrentNamespace(namespace)
			const ret = builder(...args)
			popCurrentNamespace()
			return ret
		}
	}

	const clearScope = builder => (...args) => {
		pushCurrentNode()
		const ret = builder(...args)
		popCurrentNode()
		return ret
	}

	const clearNamespace = builder => (...args) => {
		pushCurrentNamespace()
		const ret = builder(...args)
		popCurrentNamespace()
		return ret
	}

	const on = (...args) => addEventListener(currentNode, ...args)
	const off = (...args) => removeEventListener(currentNode, ...args)

	const useElement = () => currentNode
	const useTags = (toKebab = true, namespace = null) => {
		const getTag = namespaced(tagName => R.get(tags, tagName), namespace)
		return proxify({
			get(_, tagName) {
				if (toKebab) tagName = camelToKebab(tagName)
				return getTag(tagName)
			}
		})
	}

	let currentLifeCycleNode = null

	const useLifeCycle = (target) => {
		if (!target && currentLifeCycleNode) return useLifeCycle(currentLifeCycleNode)

		target = unwrap(target || currentNode)
		let hooks = lifeCycleHooks.get(target)
		if (hooks) return hooks

		const [beforeAttach, onBeforeAttach] = prepareHooks()
		const [afterAttach, onAfterAttach] = prepareHooks()
		const [beforeDetatch, onBeforeDetatch] = prepareHooks()
		const [afterDetatch, onAfterDetatch] = prepareHooks()

		hooks = {
			beforeAttach,
			afterAttach,
			beforeDetatch,
			afterDetatch,
			onBeforeAttach,
			onAfterAttach,
			onBeforeDetatch,
			onAfterDetatch
		}

		lifeCycleHooks.set(target, hooks)

		return hooks
	}

	const withLifeCycle = (handler, target = currentNode) => {
		const prevNode = currentLifeCycleNode
		currentLifeCycleNode = target

		const ret = handler()

		currentLifeCycleNode = prevNode
		return ret
	}

	const wrap = (target, lifeCycle = useLifeCycle()) => wrapObj(target, lifeCycle)

	const attrProxyMap = new WeakMap()

	const toAttr = (target) => {
		if (attrProxyMap.has(target)) return attrProxyMap.get(target)

		const attrProxy = new Proxy(target, {
			get(_, attrName) {
				return getAttr(target, attrName, currentNamespace)
			},
			set(_, attrName, val) {
				if (val === null) removeAttr(target, attrName, currentNamespace)
				setAttr(target, attrName, val, currentNamespace)
				return true
			}
		})

		attrProxyMap.set(target, attrProxy)

		return attrProxy
	}

	const attr = proxify({
		get(_, attrName) {
			return R.get(wrap(toAttr(currentNode)), attrName)
		},
		set(_, attrName, val) {
			return R.set(wrap(toAttr(currentNode)), attrName, val)
		}
	})
	const useAttr = (capture = true, toKebab = true, namespace = null) => {
		const scope = capture && currentNode || null
		const getAttribute = scoped(namespaced(attrName => R.get(attr, attrName), namespace), scope)
		const setAttribute = scoped(namespaced((attrName, val) => R.set(attr, attrName, val), namespace), scope)

		return proxify({
			get(_, attrName) {
				if (toKebab) attrName = camelToKebab(attrName)
				return getAttribute(attrName)
			},
			set(_, attrName, val) {
				if (toKebab) attrName = camelToKebab(attrName)
				return setAttribute(attrName, val)
			}
		})
	}

	const prop = proxify({
		get(_, propName) {
			return R.get(wrap(currentNode), propName)
		},
		set(_, propName, val) {
			return R.set(wrap(currentNode), propName, val)
		}
	})
	const useProp = () => {
		const getProp = scoped(propName => R.get(prop, propName))
		const setProp = scoped((propName, val) => R.set(prop, propName, val))

		return proxify({
			get(_, propName) {
				return getProp(propName)
			},
			set(_, propName, val) {
				return setProp(propName, val)
			}
		})
	}

	const text = (initVal) => {
		const textNode = createTextNode('')
		pushCurrentNode(textNode)
		const wrappedNode = wrap(textNode)
		if (initVal) wrappedNode.textContent = initVal
		popCurrentNode()
		if (currentNode) appendChild(currentNode, textNode)
		return wrappedNode
	}

	const comment = (initVal) => {
		const commentNode = createComment('')
		pushCurrentNode(commentNode)
		const wrappedNode = wrap(commentNode)
		if (initVal) wrappedNode.textContent = initVal
		popCurrentNode()
		if (currentNode) appendChild(currentNode, commentNode)
		return wrappedNode
	}

	const fragment = (builder, append = true) => {
		const ret = {}

		build(({attach, detatch, before, after, startAnchor, endAnchor}) => {
			ret.attach = attach
			ret.detatch = detatch
			ret.before = before
			ret.after = after
			ret.empty = () => {
				const tempStore = createDocumentFragment()

				let currentElement = getNextSibling(startAnchor)
				while (currentElement !== endAnchor) {
					const nextElement = getNextSibling(currentElement)
					appendChild(tempStore, currentElement)
					currentElement = nextElement
				}
			}
			ret.append = (builder) => {
				const tempStore = createDocumentFragment()
				const ret = scoped(build, tempStore)(builder)
				appendBefore(endAnchor, tempStore)
				return ret
			}
			ret.set = (builder) => {
				ret.empty()
				return ret.append(builder)
			}
		}, append)

		if (builder) ret.append(builder)

		return ret
	}

	const adopt = (rawElement, clone) => (builder, append = true) => {
		if (!rawElement) return

		const element = clone ? cloneElement(rawElement) : rawElement
		const elementStore = createDocumentFragment()

		const {beforeAttach, afterAttach, beforeDetatch, afterDetatch} = useLifeCycle(element)

		const attach = (target) => {
			if (!target) target = currentNode
			if (!target) return
			beforeAttach(target)
			appendChild(target, element)
			afterAttach(target)
		}
		const detatch = () => {
			beforeDetatch()
			appendChild(elementStore, element)
			afterDetatch()
		}
		const before = (builder) => {
			const tempStore = createDocumentFragment()
			const ret = scoped(build, tempStore)(builder)
			appendBefore(element, tempStore)
			return ret
		}
		const after = (builder) => {
			const tempStore = createDocumentFragment()
			const ret = scoped(build, tempStore)(builder)
			appendAfter(element, tempStore)
			return ret
		}

		// eslint-disable-next-line init-declarations
		let ret

		if (builder) {
			pushCurrentNode(element)
			ret = clearNamespace(builder)({
				build,
				adopt,
				text,
				comment,
				fragment,
				scoped,
				namespaced,
				clearScope,
				clearNamespace,
				element,
				on,
				off,
				mux,
				useSignal,
				useTags,
				useElement,
				useAttr,
				useProp,
				useLifeCycle,
				withLifeCycle,
				tags,
				attr,
				prop,
				attach,
				detatch,
				before,
				after
			})
			popCurrentNode()
		}

		if (append && currentNode) attach(currentNode)
		else attach(elementStore)

		if (!clone) rawElement = null

		return {element, ret, attach, detatch, before, after}
	}

	if (!tags) {
		tags = proxify({
			get(_, tagName) {
				const namespace = currentNamespace
				return (builder, append) => {
					const element = createElement(tagName, namespace)
					return adopt(element, false)(builder, append)
				}
			}
		})
	}

	if (!build) {
		build = (builder, append = true) => {
			const elementStore = createDocumentFragment()
			const startAnchor = createTextNode('')
			const endAnchor = createTextNode('')

			builder = clearNamespace(builder)

			appendChild(elementStore, startAnchor)
			appendChild(elementStore, endAnchor)

			pushCurrentNode(elementStore)

			const {beforeAttach, afterAttach, beforeDetatch, afterDetatch} = useLifeCycle(elementStore)

			const detatch = () => {
				beforeDetatch()

				let currentElement = startAnchor
				while (currentElement !== endAnchor) {
					const nextElement = getNextSibling(currentElement)
					appendChild(elementStore, currentElement)
					currentElement = nextElement
				}
				appendChild(elementStore, endAnchor)

				afterDetatch()
			}
			const attach = (target) => {
				if (!target) target = currentNode
				if (!target) return

				detatch()

				beforeAttach(target)

				appendChild(target, startAnchor)
				appendChild(target, elementStore)
				appendChild(target, endAnchor)

				afterAttach(target)
			}
			const before = (builder) => {
				const tempStore = createDocumentFragment()
				const ret = scoped(build, tempStore)(builder)
				appendBefore(startAnchor, tempStore)
				return ret
			}
			const after = (builder) => {
				const tempStore = createDocumentFragment()
				const ret = scoped(build, tempStore)(builder)
				appendAfter(endAnchor, tempStore)
				return ret
			}

			const ret = builder({
				build,
				adopt,
				text,
				comment,
				fragment,
				scoped,
				namespaced,
				clearScope,
				clearNamespace,
				on,
				off,
				mux,
				useSignal,
				useTags,
				useElement,
				useAttr,
				useProp,
				useLifeCycle,
				withLifeCycle,
				tags,
				attr,
				prop,
				attach,
				detatch,
				before,
				after,
				startAnchor,
				endAnchor
			})

			popCurrentNode()
			if (currentNode && append) attach(currentNode)

			return ret
		}
	}

	return {
		wrap,
		build,
		adopt,
		text,
		comment,
		fragment,
		scoped,
		namespaced,
		clearScope,
		clearNamespace,
		on,
		off,
		mux,
		useSignal,
		useTags,
		useElement,
		useAttr,
		useProp,
		useLifeCycle,
		withLifeCycle,
		tags: useTags(),
		attr: useAttr(false),
		prop
	}
}

const browser = (doc = document, userNamespaceMap = {}) => {
	const namespaceURIMap = Object.assign({
		xml: 'http://www.w3.org/XML/1998/namespace',
		html: 'http://www.w3.org/1999/xhtml',
		svg: 'http://www.w3.org/2000/svg',
		math: 'http://www.w3.org/1998/Math/MathML',
		xlink: 'http://www.w3.org/1999/xlink'
	}, userNamespaceMap)

	return env({
		createElement(tag, namespace) {
			if (namespace) {
				const namespaceURI = Reflect.get(namespaceURIMap, namespace) || namespace
				return doc.createElementNS(namespaceURI, tag)
			}
			return doc.createElement(tag)
		},
		createTextNode(text) {
			return doc.createTextNode(text)
		},
		createComment(text) {
			return doc.createComment(text)
		},
		createDocumentFragment() {
			return doc.createDocumentFragment()
		},
		cloneElement(element) {
			return element.cloneNode(true)
		},
		appendChild(parent, child) {
			return parent.appendChild(child)
		},
		appendBefore(node, element) {
			return node.parentNode.insertBefore(element, node)
		},
		appendAfter(node, element) {
			return node.parentNode.insertBefore(element, node.nextSibling)
		},
		getNextSibling(node) {
			return node.nextSibling
		},
		getAttr(node, attrName, namespace) {
			if (namespace) {
				const namespaceURI = Reflect.get(namespaceURIMap, namespace) || namespace
				return node.getAttributeNS(namespaceURI, attrName)
			}
			return node.getAttribute(attrName)
		},
		// eslint-disable-next-line max-params
		setAttr(node, attrName, val, namespace) {
			if (namespace) {
				const namespaceURI = Reflect.get(namespaceURIMap, namespace) || namespace
				return node.setAttributeNS(namespaceURI, attrName, val)
			}
			return node.setAttribute(attrName, val)
		},
		removeAttr(node, attrName, namespace) {
			if (namespace) {
				const namespaceURI = Reflect.get(namespaceURIMap, namespace) || namespace
				return node.removeAttributeNS(namespaceURI, attrName)
			}
			return node.removeAttribute(attrName)
		},
		addEventListener(node, ...args) {
			return node.addEventListener(...args)
		},
		removeEventListener(node, ...args) {
			return node.removeEventListener(...args)
		}
	})
}

let globalCtx = null

const wrap = (...args) => globalCtx.wrap(...args)
const build = (...args) => globalCtx.build(...args)
const adopt = (...args) => globalCtx.adopt(...args)
const text = (...args) => globalCtx.text(...args)
const comment = (...args) => globalCtx.comment(...args)
const fragment = (...args) => globalCtx.fragment(...args)
const scoped = (...args) => globalCtx.scoped(...args)
const namespaced = (...args) => globalCtx.namespaced(...args)
const clearScope = (...args) => globalCtx.clearScope(...args)
const clearNamespace = (...args) => globalCtx.clearNamespace(...args)
const on = (...args) => globalCtx.on(...args)
const off = (...args) => globalCtx.off(...args)
const useTags = (...args) => globalCtx.useTags(...args)
const useElement = (...args) => globalCtx.useElement(...args)
const useAttr = (...args) => globalCtx.useAttr(...args)
const useProp = (...args) => globalCtx.useProp(...args)
const useLifeCycle = (...args) => globalCtx.useLifeCycle(...args)
const withLifeCycle = (...args) => globalCtx.withLifeCycle(...args)
const tags = proxify({
	get(_, tagName) {
		return (...args) => R.get(globalCtx.tags, tagName)(...args)
	}
})
const attr = proxify({
	get(_, attrName) {
		return R.get(globalCtx.attr, attrName)
	},
	set(_, attrName, val) {
		return R.set(globalCtx.attr, attrName, val)
	}
})
const prop = proxify({
	get(_, propName) {
		return R.get(globalCtx.prop, propName)
	},
	set(_, propName, val) {
		return R.set(globalCtx.prop, propName, val)
	}
})

const setGlobalCtx = (ctx) => {
	globalCtx = ctx
}

const getGlobalCtx = () => globalCtx

export {
	env,
	browser,
	wrap,
	unwrap,
	build,
	adopt,
	text,
	comment,
	fragment,
	scoped,
	namespaced,
	clearScope,
	clearNamespace,
	on,
	off,
	mux,
	useSignal,
	useElement,
	useTags,
	useAttr,
	useProp,
	useLifeCycle,
	withLifeCycle,
	tags,
	attr,
	prop,
	setGlobalCtx,
	getGlobalCtx
}
