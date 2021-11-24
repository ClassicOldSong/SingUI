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
}, currentNode, currentNamespace) => {
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

	const scoped = (builder, node = currentNode) => (...args) => {
		pushCurrentNode(node)
		const ret = builder(...args)
		popCurrentNode()
		return ret
	}

	const namespaced = (builder, namespace = currentNamespace) => (...args) => {
		pushCurrentNamespace(namespace)
		const ret = builder(...args)
		popCurrentNamespace()
		return ret
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
	const useTags = (namespace) => {
		const getTag = namespaced(tagName => R.get(tags, tagName), namespace)
		return proxify({
			get(_, tagName) {
				return getTag(tagName)
			}
		})
	}
	const useAttr = (namespace) => {
		const getAttr = scoped(namespaced(attrName => R.get(attr, attrName), namespace))
		const setAttr = scoped(namespaced((attrName, val) => R.set(attr, attrName, val), namespace))
		return proxify({
			get(_, attrName) {
				return getAttr(attrName)
			},
			set(_, attrName, val) {
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

	const adopt = (rawElement, clone) => (builder, append = true) => {
		if (!rawElement) return

		const element = clone ? cloneElement(rawElement) : rawElement
		const elementStore = createDocumentFragment()

		const attach = (target) => {
			if (!target) target = currentNode
			if (!target) return
			appendChild(target, element)
		}
		const detatch = () => {
			appendChild(elementStore, element)
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

		if (builder) {
			pushCurrentNode(element)
			clearNamespace(builder)({
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

		if (append && currentNode) appendChild(currentNode, element)
		else appendChild(elementStore, element)

		if (!clone) rawElement = null

		return {attach, detatch, before, after}
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

		const detatch = () => {
			let currentElement = startAnchor
			while (currentElement !== endAnchor) {
				const nextElement = getNextSibling(currentElement)
				appendChild(elementStore, currentElement)
				currentElement = nextElement
			}
			appendChild(elementStore, endAnchor)
		}
		const attach = (target) => {
			if (!target) target = currentNode
			if (!target) return

			detatch()
			appendChild(target, startAnchor)
			appendChild(target, elementStore)
			appendChild(target, endAnchor)
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
		tags,
		attr,
		prop
	}
}

const browser = (currentNode, userNamespaceMap = {}) => {
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
				return document.createElementNS(namespaceURI, tag)
			}
			return document.createElement(tag)
		},
		createTextNode(text) {
			return document.createTextNode(text)
		},
		createComment(text) {
			return document.createComment(text)
		},
		createDocumentFragment() {
			return document.createDocumentFragment()
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
	}, currentNode)
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
const useElement = () => globalCtx.useElement()
const useAttr = () => globalCtx.useAttr()
const useProp = () => globalCtx.useProp()
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
	tags,
	attr,
	prop,
	setGlobalCtx,
	getGlobalCtx
}
