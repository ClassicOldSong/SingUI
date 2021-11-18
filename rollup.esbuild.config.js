import esbuild, {minify} from 'rollup-plugin-esbuild'

const exportName = 'singui'

const minifyPlugin = minify()

export default {
	input: 'src/main.mjs',
	output: [{
		file: 'dist/main.umd.js',
		name: exportName,
		format: 'umd',
		sourcemap: true
	}, {
		file: 'dist/main.umd.min.js',
		name: exportName,
		format: 'umd',
		plugins: [minifyPlugin]
	}, {
		file: 'dist/main.iife.js',
		name: exportName,
		format: 'iife',
		sourcemap: true
	}, {
		file: 'dist/main.iife.min.js',
		name: exportName,
		format: 'iife',
		plugins: [minifyPlugin]
	}, {
		file: 'dist/main.cjs',
		name: exportName,
		format: 'cjs',
		sourcemap: true
	}, {
		file: 'dist/main.min.cjs',
		name: exportName,
		format: 'cjs',
		plugins: [minifyPlugin]
	}, {
		file: 'dist/main.js',
		name: exportName,
		format: 'esm',
		sourcemap: true
	}, {
		file: 'dist/main.min.js',
		name: exportName,
		format: 'esm',
		plugins: [minifyPlugin]
	}],
	plugins: [
		esbuild()
	]
}
