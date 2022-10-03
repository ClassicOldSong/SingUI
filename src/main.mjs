const TARGET_SYMBOL = Symbol('TARGET')
const emptyObj = Object.create(null)
const R = Reflect

const proxify = handler => new Proxy(emptyObj, handler)

const unwrap = proxiedObj => R.get(proxiedObj, TARGET_SYMBOL) || proxiedObj

const wrap = (target) => {
	const targetObj = Object(target)
	if (targetObj !== target) return target

	const propProxy = new Proxy(targetObj, {
		get(_, propName) {
			if (propName === TARGET_SYMBOL) return target
			if (propName[0] === '$') {
				const realPropName = propName.substring(1)
				return (handler) => {
					if (handler) return val => R.set(propProxy, realPropName, handler(val, R.get(unwrap(propProxy), realPropName), realPropName))
					return val => R.set(propProxy, realPropName, val)
				}
			}

			if (propName[0] === '_') {
				const realPropName = propName.substring(1)
				return (handler) => {
					if (handler) return () => handler(realPropName, propProxy)
					return () => wrap(R.get(target, propName))
				}
			}

			return wrap(R.get(target, propName))
		},
		set(_, propName, val) {
			if (propName[0] === '$' || propName[0] === '_') propName = propName.substring(1)
			return R.set(target, propName, val)
		},
		apply(_, thisArg, argList) {
			R.apply(target, unwrap(thisArg), argList)
		}
	})

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
	currentNode = null,
	currentNamespace = null,
	lifeCycleHooks = new WeakMap()
} = {}) => {
	let build = null
	let tags = null

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

	const attr = proxify({
		get(_, attrName) {
			const target = currentNode
			const namespace = currentNamespace

			if (attrName[0] === '$') {
				const realAttrName = attrName.substring(1)
				return (handler) => {
					if (handler) return val => setAttr(target, realAttrName, handler(val, getAttr(target, realAttrName), realAttrName, namespace), namespace)
					return val => setAttr(target, realAttrName, val, namespace)
				}
			}

			if (attrName[0] === '_') {
				const realAttrName = attrName.substring(1)
				return (handler) => {
					if (handler) return () => handler(realAttrName, target, namespace)
					return () => getAttr(target, realAttrName, namespace)
				}
			}

			return getAttr(target, attrName, namespace)
		},
		set(_, attrName, val) {
			if (attrName[0] === '$' || attrName[0] === '_') attrName = attrName.substring(1)
			if (val === null) removeAttr(currentNode, attrName, currentNamespace)
			else setAttr(currentNode, attrName, val, currentNamespace)
			return true
		}
	})

	const prop = proxify({
		get(_, propName) {
			if (propName === TARGET_SYMBOL) return currentNode
			const target = currentNode
			if (propName[0] === '$') {
				const realPropName = propName.substring(1)
				return (handler) => {
					if (handler) return val => R.set(target, realPropName, handler(val, R.get(target, realPropName), realPropName))
					return val => R.set(target, realPropName, val)
				}
			}

			if (propName[0] === '_') {
				const realPropName = propName.substring(1)
				return (handler) => {
					if (handler) return () => handler(realPropName, target)
					return () => R.get(target, realPropName)
				}
			}

			return wrap(R.get(target, propName))
		},
		set(_, propName, val) {
			if (propName[0] === '$' || propName[0] === '_') propName = propName.substring(1)
			R.set(currentNode, propName, val)
			return true
		}
	})

	const text = (str = '') => {
		const textNode = createTextNode(str)
		const wrappedNode = wrap(textNode)
		if (currentNode) appendChild(currentNode, textNode)
		return wrappedNode
	}

	const comment = (str = '') => {
		const commentNode = createComment(str)
		const wrappedNode = wrap(commentNode)
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
	const useAttr = (capture = true, toKebab = true, namespace = null) => {
		const scope = capture && currentNode || null
		const getAttr = scoped(namespaced(attrName => R.get(attr, attrName), namespace), scope)
		const setAttr = scoped(namespaced((attrName, val) => R.set(attr, attrName, val), namespace), scope)
		return proxify({
			get(_, attrName) {
				if (toKebab) attrName = camelToKebab(attrName)
				return getAttr(attrName)
			},
			set(_, attrName, val) {
				if (toKebab) attrName = camelToKebab(attrName)
				return setAttr(attrName, val)
			}
		})
	}
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

	const prepareHooks = () => {
		let hooks = new Set()
		const runHooks = (...args) => hooks.forEach(hook => hook(...args))

		const addHooks = (...newHooks) => {
			for (let i of newHooks) hooks.add(i)
		}

		const removeHooks = (...oldHooks) => {
			for (let i of oldHooks) hooks.delete(i)
		}

		return [runHooks, addHooks, removeHooks]
	}

	const useLifeCycle = (target) => {
		if (!target) target = currentNode
		let hooks = lifeCycleHooks.get(target)
		if (hooks) return hooks

		const [beforeAttach, onBeforeAttach, offBeforeAttach] = prepareHooks()
		const [afterAttach, onAfterAttach, offAfterAttach] = prepareHooks()
		const [beforeDetatch, onBeforeDetatch, offBeforeDetatch] = prepareHooks()
		const [afterDetatch, onAfterDetatch, offAfterDetatch] = prepareHooks()

		hooks = {
			beforeAttach,
			afterAttach,
			beforeDetatch,
			afterDetatch,
			onBeforeAttach,
			onAfterAttach,
			onBeforeDetatch,
			onAfterDetatch,
			offBeforeAttach,
			offAfterAttach,
			offBeforeDetatch,
			offAfterDetatch
		}

		lifeCycleHooks.set(target, hooks)

		return hooks
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
				useTags,
				useElement,
				useAttr,
				useProp,
				useLifeCycle,
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

	tags = proxify({
		get(_, tagName) {
			const namespace = currentNamespace
			return (builder, append) => {
				const element = createElement(tagName, namespace)
				return adopt(element, false)(builder, append)
			}
		}
	})

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
			useTags,
			useElement,
			useAttr,
			useProp,
			useLifeCycle,
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

	return {
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
		useTags,
		useElement,
		useAttr,
		useProp,
		useLifeCycle,
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
	useElement,
	useTags,
	useAttr,
	useProp,
	useLifeCycle,
	tags,
	attr,
	prop,
	setGlobalCtx,
	getGlobalCtx
}
