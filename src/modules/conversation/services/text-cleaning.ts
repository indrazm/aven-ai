const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/gu;

export const cleanTextSource = (text: string): string => text.replace(/\r\n?/gu, '\n').replace(CONTROL_CHARACTERS, '');

export const cleanText = (text: string): string => cleanTextSource(text).replace(/\t/gu, '    ');
