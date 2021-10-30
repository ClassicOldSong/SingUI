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
	createDocumentFragment,
	appendChild,
	getAttr,
	setAttr,
	addEventListener,
	removeEventListener
}, ctx = {}) => {
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
		if (ctx.currentNode) appendChild(ctx.currentNode, textNode)
		if (ctx.currentChildren) ctx.currentChildren.push(reactiveNode)
		return reactiveNode
	}

	const tags = new Proxy({}, {
		get(target, tagName) {
			if (target[tagName]) return target[tagName]

			const tagScope = (builder) => {
				const parentNode = ctx.currentNode
				const parentChildren = ctx.currentChildren
				const element = createElement(tagName)
				const attrProxy = getAttrProxy(element)
				const propProxy = reactive(element)

				if (parentNode) appendChild(parentNode, element)
				if (parentChildren) parentChildren.push(propProxy)

				if (builder) {
					const children = []
					const on = (...args) => addEventListener(element, ...args)
					const off = (...args) => removeEventListener(element, ...args)

					const prevNode = ctx.currentNode
					const prevChildren = ctx.currentChildren
					ctx.currentNode = element
					ctx.currentChildren = children
					builder({
						tags,
						text,
						el: element,
						on,
						off,
						attr: attrProxy,
						prop: propProxy,
						$: attrProxy,
						$$: propProxy,
						parent: parentNode,
						children
					})
					ctx.currentNode = prevNode
					ctx.currentChildren = prevChildren
				}

				return propProxy
			}

			target[tagName] = tagScope

			return tagScope
		}
	})

	const build = (builder, options) => {
		const parentNode = ctx.currentNode
		const parentChildren = ctx.currentChildren
		const parent = createDocumentFragment()
		const startAnchor = createTextNode('')
		const endAnchor = createTextNode('')
		const children = []

		appendChild(parent, startAnchor)
		appendChild(parent, endAnchor)

		ctx.currentNode = parent
		ctx.currentChildren = children

		const detatch = () => {
			let currentNode = startAnchor
			while (currentNode !== endAnchor) {
				const nextNode = currentNode.nextSibling
				appendChild(parent, currentNode)
				currentNode = nextNode
			}
			appendChild(parent, endAnchor)
		}
		const attach = (target) => {
			detatch()
			appendChild(target, startAnchor)
			appendChild(target, parent)
			appendChild(target, endAnchor)
		}

		const ret = builder({ tags, text, build, _: build, parent: parentNode || parent, children, attach, detatch})

		if (parentNode && (!options || options.append)) attach(parentNode)

		ctx.currentNode = parentNode
		ctx.currentChildren = parentChildren

		if (options) {
			// Should I expose these?

			// options.elementStore = parent
			// options.startAnchor = startAnchor
			// options.endAnchor = endAnchor
			// options.children = children

			options.attach = attach
			options.detatch = detatch
		}

		return ret
	}

	return build
}

const browser = (ctx = {}) => create({
	createElement(tag) {
		return document.createElement(tag)
	},
	createTextNode(text) {
		return document.createTextNode(text)
	},
	createDocumentFragment() {
		return document.createDocumentFragment()
	},
	appendChild(parent, child) {
		return parent.appendChild(child)
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
}, ctx)

export { create, browser, reactive }
