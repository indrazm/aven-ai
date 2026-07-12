import type {KittyKeyboardOptions} from 'ink';

// Direct enable avoids Ink's startup capability query, whose response can be
// visibly echoed by terminals before raw input ownership is established.
export const keyboardProtocol: KittyKeyboardOptions = {
	mode: 'enabled',
	flags: ['disambiguateEscapeCodes'],
};
