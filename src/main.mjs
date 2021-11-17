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
}, currentNode) => {
	let build = null
	let tags = null

	const scope = (node, builder) => {
		const prevNode = currentNode
		currentNode = node
		const ret = builder()
		currentNode = prevNode
		return ret
	}

	const attr = proxify({
		get(_, attrName) {
			const target = currentNode
			if (attrName[0] === '$') {
				const realAttrName = camelToKebab(attrName.substring(1))
				return (handler) => {
					if (handler) return val => setAttr(target, realAttrName, handler(val, getAttr(target, realAttrName), realAttrName))
					return val => setAttr(target, realAttrName, val)
				}
			}

			if (attrName[0] === '_') {
				const realAttrName = camelToKebab(attrName.substring(1))
				return (handler) => {
					if (handler) return () => handler(realAttrName, target)
					return () => getAttr(target, realAttrName)
				}
			}

			return getAttr(target, camelToKebab(attrName))
		},
		set(_, attrName, val) {
			if (attrName[0] === '$' || attrName[0] === '_') attrName = attrName.substring(1)
			if (val === null) removeAttr(currentNode, attrName)
			else setAttr(currentNode, camelToKebab(attrName), val)
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

	const fragment = (builder, append = true, mamager) => {
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
				const ret = scope(tempStore, () => build(builder))
				appendBefore(endAnchor, tempStore)
				return ret
			}
			ret.set = (builder) => {
				ret.empty()
				return ret.append(builder)
			}
		}, append, mamager)

		if (builder) ret.append(builder)

		return ret
	}

	const on = (...args) => addEventListener(currentNode, ...args)
	const off = (...args) => removeEventListener(currentNode, ...args)

	const useTags = () => tags
	const useElement = () => currentNode
	const useAttr = () => {
		const element = currentNode
		return proxify({
			get(_, attrName) {
				return scope(element, () => R.get(attr, attrName))
			},
			set(_, attrName, val) {
				return scope(element, () => R.set(attr, attrName, val))
			}
		})
	}
	const useProp = () => {
		const element = currentNode
		return proxify({
			get(_, propName) {
				return scope(element, () => R.get(prop, propName))
			},
			set(_, propName, val) {
				return scope(element, () => R.set(prop, propName, val))
			}
		})
	}

	const adopt = (rawElement, clone) => (builder, append = true) => {
		if (!rawElement) return

		const element = clone ? cloneElement(rawElement) : rawElement
		const parentNode = currentNode
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
			const ret = scope(tempStore, builder)
			appendBefore(element, tempStore)
			return ret
		}
		const after = (builder) => {
			const tempStore = createDocumentFragment()
			const ret = scope(tempStore, builder)
			appendAfter(element, tempStore)
			return ret
		}

		if (builder) {
			currentNode = element
			builder({
				build,
				adopt,
				text,
				comment,
				fragment,
				scope,
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
			currentNode = parentNode
		}

		if (append && parentNode) appendChild(parentNode, element)
		else appendChild(elementStore, element)

		if (!clone) rawElement = null

		return {attach, detatch, before, after}
	}

	const tagHandlerStore = {}

	tags = proxify({
		get(_, tagName) {
			const storedHanler = R.get(tagHandlerStore, tagName)
			if (storedHanler) return storedHanler

			const kebabTagName = camelToKebab(tagName)

			const tagHandler = (builder, append) => {
				const element = createElement(kebabTagName)
				return adopt(element, false)(builder, append)
			}

			R.set(tagHandlerStore, tagName, tagHandler)

			return tagHandler
		}
	})

	build = (builder, append = true, mamager) => {
		const parentNode = currentNode
		const elementStore = createDocumentFragment()
		const startAnchor = createTextNode('')
		const endAnchor = createTextNode('')

		appendChild(elementStore, startAnchor)
		appendChild(elementStore, endAnchor)

		currentNode = elementStore

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
			const ret = scope(tempStore, builder)
			appendBefore(startAnchor, tempStore)
			return ret
		}
		const after = (builder) => {
			const tempStore = createDocumentFragment()
			const ret = scope(tempStore, builder)
			appendAfter(endAnchor, tempStore)
			return ret
		}

		const ret = builder({
			build,
			adopt,
			text,
			comment,
			fragment,
			scope,
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

		if (parentNode && append) attach(parentNode)

		currentNode = parentNode

		if (mamager) {
			mamager.attach = attach
			mamager.detatch = detatch
		}

		return ret
	}

	return {build, adopt, text, comment, fragment, scope, on, off, useTags, useElement, useAttr, useProp, tags, attr, prop}
}

let globalCtx = null

const browser = currentNode => env({
	createElement(tag) {
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
	getAttr(node, attrName) {
		return node.getAttribute(attrName)
	},
	setAttr(node, attrName, val) {
		return node.setAttribute(attrName, val)
	},
	removeAttr(node, attrName) {
		return node.removeAttribute(attrName)
	},
	addEventListener(node, ...args) {
		return node.addEventListener(...args)
	},
	removeEventListener(node, ...args) {
		return node.removeEventListener(...args)
	}
}, currentNode)

const build = (...args) => globalCtx.build(...args)
const adopt = (...args) => globalCtx.adopt(...args)
const text = (...args) => globalCtx.text(...args)
const comment = (...args) => globalCtx.comment(...args)
const fragment = (...args) => globalCtx.fragment(...args)
const scope = (...args) => globalCtx.scope(...args)
const on = (...args) => globalCtx.on(...args)
const off = (...args) => globalCtx.off(...args)
const useTags = () => globalCtx.useTags()
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

export {env, browser, wrap, unwrap, build, adopt, text, comment, fragment, scope, on, off, useElement, useTags, useAttr, useProp, tags, attr, prop, setGlobalCtx, getGlobalCtx}