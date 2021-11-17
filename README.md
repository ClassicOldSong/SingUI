# SINGUI

The next-gen, no compile/transpile needed, self-contained JS UI library

[Try it out](https://stackblitz.com/edit/singui-demo?file=index.js)

## Usage

### Browser

```html
<script src="https://cdn.jsdelivr.net/npm/singui/dist/main.min.js"></script>
<script>
	const {browser, tags, text, attr, prop, setGlobalCtx} = singui
</script>
```

or

```javascript
import {browser, tags, text, attr, prop, setGlobalCtx} from 'singui'
```

or

```javascript
const {browser, tags, text, attr, prop, setGlobalCtx} = require('singui')
```

then

```javascript
setGlobalCtx(browser())

const app = (target) => build(({attach}) => {
	const {h1, center, p} = tags

	center(() => {
		h1(() => {
			attr.style = 'font-weight: 300'
			text('Hello World!')
		})
	})

	p(() => {
		const style = prop.style
		style.color = 'green'
		style.textAlign = 'center'
		text('Welcome to SingUI')
	})

	attach(target)
})

app(document.body)
```
More details please see [Try it out](https://stackblitz.com/edit/singui-demo?file=index.js)

## License

MIT
