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
}) => {
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
	const getTextHandler = (ctx) => {
		const text = (str) => {
			const textNode = createTextNode(str)
			appendChild(ctx.currentNode, textNode)
			return reactive(textNode)
		}

		return text
	}

	const getTagsProxy = (ctx) => {
		const tags = new Proxy(
			{},
			{
				get(target, tagName) {
					if (target[tagName]) return target[tagName]

					const tagScope = (builder) => {
						const parentNode = ctx.currentNode
						const element = createElement(tagName)
						const attrProxy = getAttrProxy(element)
						const propProxy = reactive(element)

						if (parentNode) {
							appendChild(parentNode, element)
						}

						const on = (...args) => addEventListener(element, ...args)
						const off = (...args) => removeEventListener(element, ...args)

						const _build = (_builder) => {
							const prevNode = ctx.currentNode
							ctx.currentNode = element
							_builder({
								tags,
								text: ctx.text,
								el: element,
								on,
								off,
								attr: attrProxy,
								prop: propProxy,
								$: attrProxy,
								$$: propProxy,
								build: _build,
								_: _build,
								parent: parentNode
							})
							ctx.currentNode = prevNode
						}

						if (builder) {
							_build(builder)
						}

						return propProxy
					}

					target[tagName] = tagScope

					return tagScope
				}
			}
		)

		return tags
	}

	const build = (builder) => {
		const elementStore = createDocumentFragment()
		const ctx = {
			currentNode: elementStore
		}
		ctx.text = getTextHandler(ctx)
		ctx.tags = getTagsProxy(ctx)
		const { text, tags } = ctx
		const _build = _builder => _builder({ tags, text, build: _build, _: _build, parent: elementStore })
		const ret = _build(builder)
		ctx.currentNode = null
		return ret
	}

	return build
}

const browser = () =>
	create({
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
			parent.appendChild(child)
		},
		getAttr(node, attrName) {
			node.getAttribute(attrName)
		},
		setAttr(node, attrName, val) {
			node.setAttribute(attrName, val)
		},
		addEventListener(node, ...args) {
			node.addEventListener(...args)
		},
		removeEventListener(node, ...args) {
			node.removeEventListener(...args)
		}
	})

export { create, browser, reactive }
