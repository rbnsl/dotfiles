"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCurrentThemeLightness = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const strip_json_comments_1 = __importDefault(require("strip-json-comments"));
const themeColorMap = {
    'Abyss': 'dark',
    'Default Dark+': 'dark',
    'Default Light+': 'light',
    'Visual Studio Dark': 'dark',
    'Visual Studio Light': 'light',
    'Default High Contrast': 'dark',
    'Kimbie Dark': 'dark',
    'Monokai Dimmed': 'dark',
    'Monokai': 'dark',
    'Quiet Light': 'light',
    'Red': 'dark',
    'vs-seti': 'dark',
    'Solarized Dark': 'dark',
    'Solarized Light': 'light',
    'Tomorrow Night Blue': 'dark',
    'One Dark Pro': 'dark',
    'One Dark Pro Vivid': 'dark',
    'One Dark Pro Bold': 'dark',
    'Material Theme': 'dark',
    'Material Theme High Contrast': 'dark',
    'Material Theme Darker': 'dark',
    'Material Theme Darker High Contrast': 'dark',
    'Material Theme Palenight': 'dark',
    'Material Theme Palenight High Contrast': 'dark',
    'Material Theme Ocean': 'dark',
    'Material Theme Ocean High Contrast': 'dark',
    'Material Theme Lighter': 'light',
    'Material Theme Lighter High Contrast': 'light',
    'Atom One Dark': 'dark',
    'Dracula': 'dark',
    'Dracula Soft': 'dark'
};
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16) / 255,
        g: parseInt(result[2], 16) / 255,
        b: parseInt(result[3], 16) / 255
    } : null;
}
function getCurrentThemeLightness() {
    const colorTheme = vscode.workspace.getConfiguration('workbench').get('colorTheme');
    for (const extension of vscode.extensions.all) {
        if (extension.packageJSON === undefined || extension.packageJSON.contributes === undefined || extension.packageJSON.contributes.themes === undefined) {
            continue;
        }
        const candidateThemes = extension.packageJSON.contributes.themes.filter((themePkg) => themePkg.label === colorTheme || themePkg.id === colorTheme);
        if (candidateThemes.length === 0) {
            continue;
        }
        try {
            const themePath = path.resolve(extension.extensionPath, candidateThemes[0].path);
            let theme = JSON.parse(strip_json_comments_1.default(fs.readFileSync(themePath, 'utf8')));
            while (theme.include) {
                const includedTheme = JSON.parse(strip_json_comments_1.default(fs.readFileSync(path.resolve(path.dirname(themePath), theme.include), 'utf8')));
                theme.include = undefined;
                theme = Object.assign(Object.assign({}, theme), includedTheme);
            }
            const bgColor = hexToRgb(theme.colors['editor.background']);
            if (bgColor) {
                // http://stackoverflow.com/a/3943023/112731
                const r = bgColor.r <= 0.03928 ? bgColor.r / 12.92 : Math.pow((bgColor.r + 0.055) / 1.055, 2.4);
                const g = bgColor.r <= 0.03928 ? bgColor.g / 12.92 : Math.pow((bgColor.g + 0.055) / 1.055, 2.4);
                const b = bgColor.r <= 0.03928 ? bgColor.b / 12.92 : Math.pow((bgColor.b + 0.055) / 1.055, 2.4);
                const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                if (L > 0.179) {
                    return 'light';
                }
                else {
                    return 'dark';
                }
            }
            else if (theme.type && theme.type === 'dark') {
                return 'dark';
            }
        }
        catch (e) {
        }
        const uiTheme = candidateThemes[0].uiTheme;
        if (!uiTheme || uiTheme === 'vs') {
            return 'light';
        }
        else {
            return 'dark';
        }
    }
    if (themeColorMap[colorTheme] === 'dark') {
        return 'dark';
    }
    return 'light';
}
exports.getCurrentThemeLightness = getCurrentThemeLightness;
//# sourceMappingURL=theme.js.map