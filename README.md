# SINGUI

The next-gen, no compile/transpile needed, self-contained JS UI library

[Try it out](https://stackblitz.com/edit/singui-demo?file=index.js)

## Usage

### Browser

```html
<script type="text/javascript" src="cdn/to/singui.js"></script>
<script>
	const {browser} = singui
</script>
```

or

```javascript
import {browser} from 'singui'
```

or

```javascript
const {browser} = require('singui')
```

then

```javascript
const {build} = browser()

const app = ({tags, text, parent}) => {
	const {h1, center, p} = tags

	center(() => {
		h1(({$}) => {
			$.style = 'font-weight: 300'
			text('Hello World!')
		})
	})

	p(({$$}) => {
		const style = $$.style
		style.color = 'green'
		style.textAlign = 'center'
		text('Welcome to SingUI')
	})

	return parent
}

const myApp = build(app)

document.body.appendChild(myApp)
```
More details please see [Try it out](https://stackblitz.com/edit/singui-demo?file=index.js)

## License

MIT
