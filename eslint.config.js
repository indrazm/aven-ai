import eslint from '@eslint/js';
import babelParser from '@babel/eslint-parser';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
	{ignores: ['dist/**', 'coverage/**', 'node_modules/**']},
	eslint.configs.recommended,
	{
		files: ['**/*.ts', '**/*.tsx'],
		languageOptions: {
			parser: babelParser,
			parserOptions: {
				requireConfigFile: false,
				babelOptions: {
					presets: [['@babel/preset-typescript', {ignoreExtensions: true}]],
					parserOpts: {plugins: ['jsx']},
				},
			},
		},
		plugins: {'react-hooks': reactHooks},
		rules: {
			'no-undef': 'off',
			'no-unused-vars': 'off',
			'no-control-regex': 'off',
			'react-hooks/rules-of-hooks': 'error',
			'react-hooks/exhaustive-deps': 'error',
		},
	},
];
