const dummyFn = _ => _

const reactive = (_target) => {
	const targetObj = Object(_target)
	if (targetObj !== _target) return _target

	const propProxy = new Proxy(Object(targetObj), {
		get(target, propName) {
			if (propName[0] === '$') {
				const realPropName = propName.substring(1)
				return (handler = dummyFn) =>
					(val) => {
						propProxy[realPropName] = handler(val, propProxy[realPropName], realPropName)
					}
			}

			if (propName[0] === '_') {
				const realPropName = propName.substring(1)
				return (handler = () => reactive(target[propName])) => () => handler(realPropName, propProxy)
			}

			return reactive(target[propName])
		},
		set(target, propName, val) {
			if (propName[0] === '$' || propName[0] === '_') propName = propName.substring(1)
			target[propName] = val
			return true
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
	appendChild,
	appendBefore,
	getNextSibling,
	getAttr,
	setAttr,
	addEventListener,
	removeEventListener
}, currentNode) => {
	let build = null

	const scope = (node, builder, ...args) => {
		const prevNode = currentNode
		currentNode = node
		const ret = builder(...args)
		currentNode = prevNode
		return ret
	}

	const attr = new Proxy({}, {
		get(_, attrName) {
			const element = currentNode
			if (attrName[0] === '$') {
				const realAttrName = camelToKebab(attrName.substring(1))
				return (handler) => {
					if (handler) return (val) => {
						setAttr(element, realAttrName, handler(val, getAttr(element, realAttrName), realAttrName))
					}

					return (val) => {
						setAttr(element, realAttrName, val)
					}
				}
			}

			if (attrName[0] === '_') {
				const realAttrName = camelToKebab(attrName.substring(1))
				return (handler) => {
					if (handler) return () => handler(realAttrName, element)
					return () => getAttr(element, realAttrName)
				}
			}

			return getAttr(element, camelToKebab(attrName))
		},
		set(_, attrName, val) {
			if (attrName[0] === '$' || attrName[0] === '_') attrName = attrName.substring(1)
			setAttr(currentNode, camelToKebab(attrName), val)
			return true
		}
	})

	const prop = new Proxy({}, {
		get(_, propName) {
			const element = currentNode
			if (propName[0] === '$') {
				const realPropName = propName.substring(1)
				return (handler) => {
					if (handler) return (val) => {
						element[realPropName] = handler(val, element[realPropName], realPropName)
					}

					return (val) => {
						element[realPropName] = val
					}
				}
			}

			if (propName[0] === '_') {
				const realPropName = propName.substring(1)
				return (handler) => {
					if (handler) return () => handler(realPropName, element)
					return () => element[realPropName]
				}
			}

			return reactive(element[propName])
		},
		set(_, propName, val) {
			if (propName[0] === '$' || propName[0] === '_') propName = propName.substring(1)
			currentNode[propName] = val
			return true
		}
	})

	const text = (str = '') => {
		const textNode = createTextNode(str)
		const reactiveNode = reactive(textNode)
		if (currentNode) appendChild(currentNode, textNode)
		return reactiveNode
	}

	const comment = (str = '') => {
		const commentNode = createComment(str)
		const reactiveNode = reactive(commentNode)
		if (currentNode) appendChild(currentNode, commentNode)
		return reactiveNode
	}

	const fragment = (mamager) => {
		const ret = {}

		build(({attach, detatch, startAnchor, endAnchor}) => {
			ret.attach = attach
			ret.detatch = detatch
			ret.empty = () => {
				const tempStore = createDocumentFragment()

				let currentElement = getNextSibling(startAnchor)
				while (currentElement !== endAnchor) {
					const nextElement = getNextSibling(currentElement)
					appendChild(tempStore, currentElement)
					currentElement = nextElement
				}
			}
			ret.append = (builder, ...args) => {
				const tempStore = createDocumentFragment()
				const ret = scope(tempStore, builder, ...args)
				appendBefore(endAnchor, tempStore)
				return ret
			}
			ret.set = (builder) => {
				ret.empty()
				return ret.append(builder)
			}
		}, mamager)

		return ret
	}

	const on = (...args) => addEventListener(currentNode, ...args)
	const off = (...args) => removeEventListener(currentNode, ...args)

	const tags = new Proxy({}, {
		get(target, tagName) {
			if (target[tagName]) return target[tagName]

			const kebabTagName = camelToKebab(tagName)

			const tagScope = (builder, append = true) => {
				const parentNode = currentNode
				const element = createElement(kebabTagName)
				const elementStore = createDocumentFragment()

				const attach = (target) => {
					if (!target) target = currentNode
					if (!target) return
					appendChild(target, element)
				}
				const detatch = () => {
					appendChild(elementStore, element)
				}

				if (builder) {
					currentNode = element
					builder({
						tags,
						text,
						comment,
						fragment,
						element,
						el: element,
						on,
						off,
						attach,
						detatch,
						attr,
						prop,
						$: attr,
						$$: prop
					})
					currentNode = parentNode
				}

				if (append && parentNode) appendChild(parentNode, element)
				else appendChild(elementStore, element)

				return [attach, detatch]
			}

			target[tagName] = tagScope

			return tagScope
		}
	})

	build = (builder, mamager) => {
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

		const ret = builder({tags, text, comment, fragment, build, scope, attr, prop, $: attr, $$: prop, on, off, attach, detatch, startAnchor, endAnchor})

		if (parentNode && (!mamager || mamager.append)) attach(parentNode)

		currentNode = parentNode

		if (mamager) {
			// Should I expose these?

			// mamager.elementStore = elementStore
			// mamager.startAnchor = startAnchor
			// mamager.endAnchor = endAnchor

			mamager.attach = attach
			mamager.detatch = detatch
		}

		return ret
	}

	return {build, text, comment, tags, fragment, scope, on, off, attr, prop}
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
	appendChild(parent, child) {
		return parent.appendChild(child)
	},
	appendBefore(node, element) {
		return node.parentNode.insertBefore(element, node)
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
	addEventListener(node, ...args) {
		return node.addEventListener(...args)
	},
	removeEventListener(node, ...args) {
		return node.removeEventListener(...args)
	}
}, currentNode)

const build = (...args) => globalCtx.build(...args)
const scope = (...args) => globalCtx.scope(...args)
const fragment = (...args) => globalCtx.fragment(...args)
const on = (...args) => globalCtx.on(...args)
const off = (...args) => globalCtx.off(...args)

const setGlobalCtx = (ctx) => {
	globalCtx = ctx
}

const getGlobalCtx = () => globalCtx

export { env, browser, reactive, build, scope, fragment, on, off, setGlobalCtx, getGlobalCtx }
