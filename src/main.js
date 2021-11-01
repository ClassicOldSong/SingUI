const dummyFn = (_, val) => val

const reactive = (target) => {
	if (Object(target) !== target) return target

	const setHandlerStore = {}
	const getHandlerStore = {}

	const propProxy = new Proxy(Object(target), {
		get(target, propName) {
			if (propName[0] === '$') {
				const realPropName = propName.substring(1)
				return (handler = dummyFn) =>
					(val) => {
						propProxy[realPropName] = handler(propName, val, propProxy[realPropName])
					}
			}

			if (propName[0] === '_') {
				const realPropName = propName.substring(1)
				const getter = getHandlerStore[realPropName] || (() => target[realPropName])
				return (handler = () => reactive(getter())) =>
					() =>
						handler(realPropName, propProxy)
			}

			const getter = getHandlerStore[propName] || (() => target[propName])
			return reactive(getter())
		},
		set(target, propName, val) {
			if (propName[0] === '$') {
				const realPpropName = propName.substring(1)
				setHandlerStore[realPpropName] = val
				return true
			}

			if (propName[0] === '_') {
				const realPpropName = propName.substring(1)
				getHandlerStore[realPpropName] = val
				return true
			}

			if (setHandlerStore[propName]) target[propName] = setHandlerStore[propName](propName, val, target[propName])
			else target[propName] = val

			return true
		},
		apply(target, thisArg, argList) {
			return target.call(thisArg, ...argList)
		}
	})

	return propProxy
}

const create = ({
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

	const getAttrProxy = (element) => {
		const attrProxy = new Proxy(element, {
			get(_, attrName) {
				if (attrName[0] === '$') {
					const realAttrName = attrName.substring(1)
					return (val) => {
						if (!val) return getAttr(_, realAttrName)
						attrProxy[attrName] = val
					}
				}
				return getAttr(_, attrName)
			},
			set(_, attrName, val) {
				if (attrName[0] === '$') attrName = attrName.substring(1)
				setAttr(_, attrName, val)
				return true
			}
		})

		return attrProxy
	}


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

	const fragment = (options) => {
		let fragmentStartAnchor = null
		let fragmentEndAnchor = null

		build(({startAnchor, endAnchor}) => {
			fragmentStartAnchor = startAnchor
			fragmentEndAnchor = endAnchor
		}, options)

		const empty = () => {
			const tempStore = createDocumentFragment()

			let currentElement = getNextSibling(fragmentStartAnchor)
			while (currentElement !== fragmentEndAnchor) {
				const nextElement = getNextSibling(currentElement)
				appendChild(tempStore, currentElement)
				currentElement = nextElement
			}
		}
		const append = (builder, ...args) => {
			const tempStore = createDocumentFragment()
			const ret = scope(tempStore, builder, ...args)
			appendBefore(fragmentEndAnchor, tempStore)
			return ret
		}
		const set = (builder) => {
			empty()
			return append(builder)
		}

		return {
			empty,
			append,
			set
		}
	}

	const tags = new Proxy({}, {
		get(target, tagName) {
			if (target[tagName]) return target[tagName]

			const tagScope = (builder, append = true) => {
				const parentNode = currentNode
				const element = createElement(tagName)
				const elementStore = createDocumentFragment()
				const propProxy = reactive(element)

				if (builder) {
					const attrProxy = getAttrProxy(element)
					const on = (...args) => addEventListener(element, ...args)
					const off = (...args) => removeEventListener(element, ...args)
					const attach = (target) => {
						if (!target) target = currentNode
						if (!target) return
						appendChild(target, element)
					}
					const detatch = () => {
						appendChild(elementStore, element)
					}

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
						attr: attrProxy,
						prop: propProxy,
						$: attrProxy,
						$$: propProxy
					})
					currentNode = parentNode
				}

				if (append && parentNode) appendChild(parentNode, element)
				else appendChild(elementStore, element)

				return propProxy
			}

			target[tagName] = tagScope

			return tagScope
		}
	})

	build = (builder, options) => {
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

		const ret = builder({ tags, text, comment, fragment, build, attach, detatch, startAnchor, endAnchor})

		if (parentNode && (!options || options.append)) attach(parentNode)

		currentNode = parentNode

		if (options) {
			// Should I expose these?

			// options.elementStore = elementStore
			// options.startAnchor = startAnchor
			// options.endAnchor = endAnchor

			options.attach = attach
			options.detatch = detatch
		}

		return ret
	}

	return {build, text, comment, tags, fragment, scope}
}

const browser = currentNode => create({
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

export { create, browser, reactive }
