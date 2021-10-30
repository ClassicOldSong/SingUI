import buble from '@rollup/plugin-buble'
import {terser} from 'rollup-plugin-terser'

export default {
	input: 'src/main.js',
	output: {
		dir: 'dist',
		name: 'singui',
		format: 'umd'
	},
	plugins: [
		buble(),
		terser()
	]
};
