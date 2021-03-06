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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MathPreview = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const latex_utensils_1 = require("latex-utensils");
const path = __importStar(require("path"));
const mathjaxpool_1 = require("./mathjaxpool");
const utils = __importStar(require("../../utils/utils"));
const textdocumentlike_1 = require("../../components/textdocumentlike");
const theme_1 = require("../../utils/theme");
class MathPreview {
    constructor(extension) {
        this.color = '#000000';
        this.extension = extension;
        this.mj = new mathjaxpool_1.MathJaxPool();
    }
    postProcessNewCommands(commands) {
        return commands.replace(/\\providecommand/g, '\\newcommand')
            .replace(/\\newcommand\*/g, '\\newcommand')
            .replace(/\\renewcommand\*/g, '\\renewcommand')
            .replace(/\\DeclarePairedDelimiter{(\\[a-zA-Z]+)}{([^{}]*)}{([^{}]*)}/g, '\\newcommand{$1}[2][]{#1$2 #2 #1$3}');
    }
    async loadNewCommandFromConfigFile(newCommandFile) {
        let commandsString = '';
        if (newCommandFile === '') {
            return commandsString;
        }
        if (path.isAbsolute(newCommandFile)) {
            if (fs.existsSync(newCommandFile)) {
                commandsString = fs.readFileSync(newCommandFile, { encoding: 'utf8' });
            }
        }
        else {
            if (this.extension.manager.rootFile === undefined) {
                await this.extension.manager.findRoot();
            }
            const rootDir = this.extension.manager.rootDir;
            if (rootDir === undefined) {
                this.extension.logger.addLogMessage(`Cannot identify the absolute path of new command file ${newCommandFile} without root file.`);
                return '';
            }
            const newCommandFileAbs = path.join(rootDir, newCommandFile);
            if (fs.existsSync(newCommandFileAbs)) {
                commandsString = fs.readFileSync(newCommandFileAbs, { encoding: 'utf8' });
            }
        }
        commandsString = commandsString.replace(/^\s*$/gm, '');
        commandsString = this.postProcessNewCommands(commandsString);
        return commandsString;
    }
    async findProjectNewCommand(ctoken) {
        const configuration = vscode.workspace.getConfiguration('latex-workshop');
        const newCommandFile = configuration.get('hover.preview.newcommand.newcommandFile');
        let commandsInConfigFile = '';
        if (newCommandFile !== '') {
            commandsInConfigFile = await this.loadNewCommandFromConfigFile(newCommandFile);
        }
        if (!configuration.get('hover.preview.newcommand.parseTeXFile.enabled')) {
            return commandsInConfigFile;
        }
        let commands = [];
        let exceeded = false;
        setTimeout(() => { exceeded = true; }, 5000);
        for (const tex of this.extension.manager.getIncludedTeX()) {
            if (ctoken.isCancellationRequested) {
                return '';
            }
            if (exceeded) {
                this.extension.logger.addLogMessage('Timeout error when parsing preambles in findProjectNewCommand.');
                throw new Error('Timeout Error in findProjectNewCommand');
            }
            const content = this.extension.manager.cachedContent[tex].content;
            commands = commands.concat(await this.findNewCommand(content));
        }
        return commandsInConfigFile + '\n' + this.postProcessNewCommands(commands.join(''));
    }
    async findNewCommand(content) {
        let commands = [];
        try {
            const ast = await this.extension.pegParser.parseLatexPreamble(content);
            const regex = /((re)?new|provide)command(\\*)?|DeclareMathOperator(\\*)?/;
            for (const node of ast.content) {
                if (((latex_utensils_1.latexParser.isCommand(node) && node.name.match(regex)) || latex_utensils_1.latexParser.isDefCommand(node)) && node.args.length > 0) {
                    const s = latex_utensils_1.latexParser.stringify(node);
                    commands.push(s);
                }
                else if (latex_utensils_1.latexParser.isCommand(node) && node.name === 'DeclarePairedDelimiter' && node.args.length === 3) {
                    const name = latex_utensils_1.latexParser.stringify(node.args[0]);
                    const leftDelim = latex_utensils_1.latexParser.stringify(node.args[1]).slice(1, -1);
                    const rightDelim = latex_utensils_1.latexParser.stringify(node.args[2]).slice(1, -1);
                    const s = `\\newcommand${name}[2][]{#1${leftDelim} #2 #1${rightDelim}}`;
                    commands.push(s);
                }
            }
        }
        catch (e) {
            commands = [];
            const regex = /(\\(?:(?:(?:(?:re)?new|provide)command|DeclareMathOperator)(\*)?{\\[a-zA-Z]+}(?:\[[^[\]{}]*\])*{.*})|\\(?:def\\[a-zA-Z]+(?:#[0-9])*{.*})|\\DeclarePairedDelimiter{\\[a-zA-Z]+}{[^{}]*}{[^{}]*})/gm;
            const noCommentContent = content.replace(/([^\\]|^)%.*$/gm, '$1'); // Strip comments
            let result;
            do {
                result = regex.exec(noCommentContent);
                if (result) {
                    let command = result[1];
                    if (result[2]) {
                        command = command.replace(/\*/, '');
                    }
                    commands.push(command);
                }
            } while (result);
        }
        return commands;
    }
    addDummyCodeBlock(md) {
        // We need a dummy code block in hover to make the width of hover larger.
        const dummyCodeBlock = '```\n```';
        return dummyCodeBlock + '\n' + md + '\n' + dummyCodeBlock;
    }
    async provideHoverOnTex(document, tex, newCommand) {
        const configuration = vscode.workspace.getConfiguration('latex-workshop');
        const scale = configuration.get('hover.preview.scale');
        let s = this.renderCursor(document, tex.range);
        s = this.mathjaxify(s, tex.envname);
        const typesetArg = {
            math: newCommand + this.stripTeX(s),
            format: 'TeX',
            svgNode: true,
        };
        const typesetOpts = { scale, color: this.color };
        try {
            const xml = await this.mj.typeset(typesetArg, typesetOpts);
            const md = utils.svgToDataUrl(xml);
            return new vscode.Hover(new vscode.MarkdownString(this.addDummyCodeBlock(`![equation](${md})`)), tex.range);
        }
        catch (e) {
            this.extension.logger.logOnRejected(e);
            this.extension.logger.addLogMessage(`Error when MathJax is rendering ${typesetArg.math}`);
            throw e;
        }
    }
    async provideHoverOnRef(document, position, refData, token, ctoken) {
        const configuration = vscode.workspace.getConfiguration('latex-workshop');
        const line = refData.position.line;
        const link = vscode.Uri.parse('command:latex-workshop.synctexto').with({ query: JSON.stringify([line, refData.file]) });
        const mdLink = new vscode.MarkdownString(`[View on pdf](${link})`);
        mdLink.isTrusted = true;
        if (configuration.get('hover.ref.enabled')) {
            const tex = this.findHoverOnRef(document, position, token, refData);
            if (tex) {
                const newCommands = await this.findProjectNewCommand(ctoken);
                return this.provideHoverPreviewOnRef(tex, newCommands, refData);
            }
        }
        const md = '```latex\n' + refData.documentation + '\n```\n';
        const refRange = document.getWordRangeAtPosition(position, /\{.*?\}/);
        const refNumberMessage = this.refNumberMessage(refData);
        if (refNumberMessage !== undefined && configuration.get('hover.ref.number.enabled')) {
            return new vscode.Hover([md, refNumberMessage, mdLink], refRange);
        }
        return new vscode.Hover([md, mdLink], refRange);
    }
    async provideHoverPreviewOnRef(tex, newCommand, refData) {
        const configuration = vscode.workspace.getConfiguration('latex-workshop');
        const scale = configuration.get('hover.preview.scale');
        let tag;
        if (refData.prevIndex !== undefined && configuration.get('hover.ref.number.enabled')) {
            tag = refData.prevIndex.refNumber;
        }
        else {
            tag = refData.label;
        }
        const newTex = this.replaceLabelWithTag(tex.texString, refData.label, tag);
        const s = this.mathjaxify(newTex, tex.envname, { stripLabel: false });
        const obj = { labels: {}, IDs: {}, startNumber: 0 };
        const typesetArg = {
            width: 50,
            equationNumbers: 'AMS',
            math: newCommand + this.stripTeX(s),
            format: 'TeX',
            svgNode: true,
            state: { AMS: obj }
        };
        const typesetOpts = { scale, color: this.color };
        try {
            const xml = await this.mj.typeset(typesetArg, typesetOpts);
            const md = utils.svgToDataUrl(xml);
            const line = refData.position.line;
            const link = vscode.Uri.parse('command:latex-workshop.synctexto').with({ query: JSON.stringify([line, refData.file]) });
            const mdLink = new vscode.MarkdownString(`[View on pdf](${link})`);
            mdLink.isTrusted = true;
            return new vscode.Hover([this.addDummyCodeBlock(`![equation](${md})`), mdLink], tex.range);
        }
        catch (e) {
            this.extension.logger.logOnRejected(e);
            this.extension.logger.addLogMessage(`Error when MathJax is rendering ${typesetArg.math}`);
            throw e;
        }
    }
    refNumberMessage(refData) {
        if (refData.prevIndex) {
            const refNum = refData.prevIndex.refNumber;
            const refMessage = `numbered ${refNum} at last compilation`;
            return refMessage;
        }
        return undefined;
    }
    replaceLabelWithTag(tex, refLabel, tag) {
        const texWithoutTag = tex.replace(/\\tag\{(\{[^{}]*?\}|.)*?\}/g, '');
        let newTex = texWithoutTag.replace(/\\label\{(.*?)\}/g, (_matchString, matchLabel, _offset, _s) => {
            if (refLabel) {
                if (refLabel === matchLabel) {
                    if (tag) {
                        return `\\tag{${tag}}`;
                    }
                    else {
                        return `\\tag{${matchLabel}}`;
                    }
                }
                return '\\notag';
            }
            else {
                return `\\tag{${matchLabel}}`;
            }
        });
        newTex = newTex.replace(/^$/g, '');
        // To work around a bug of \tag with multi-line environments,
        // we have to put \tag after the environments.
        // See https://github.com/mathjax/MathJax/issues/1020
        newTex = newTex.replace(/(\\tag\{.*?\})([\r\n\s]*)(\\begin\{(aligned|alignedat|gathered|split)\}[^]*?\\end\{\4\})/gm, '$3$2$1');
        newTex = newTex.replace(/^\\begin\{(\w+?)\}/, '\\begin{$1*}');
        newTex = newTex.replace(/\\end\{(\w+?)\}$/, '\\end{$1*}');
        return newTex;
    }
    stripTeX(tex) {
        if (tex.startsWith('$$') && tex.endsWith('$$')) {
            tex = tex.slice(2, tex.length - 2);
        }
        else if (tex.startsWith('$') && tex.endsWith('$')) {
            tex = tex.slice(1, tex.length - 1);
        }
        else if (tex.startsWith('\\(') && tex.endsWith('\\)')) {
            tex = tex.slice(2, tex.length - 2);
        }
        else if (tex.startsWith('\\[') && tex.endsWith('\\]')) {
            tex = tex.slice(2, tex.length - 2);
        }
        return tex;
    }
    getColor() {
        const lightness = theme_1.getCurrentThemeLightness();
        if (lightness === 'light') {
            this.color = '#000000';
        }
        else {
            this.color = '#ffffff';
        }
    }
    // Test whether cursor is in tex command strings
    // like \begin{...} \end{...} \xxxx{ \[ \] \( \) or \\
    isCursorInTeXCommand(document) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return false;
        }
        const cursor = editor.selection.active;
        const r = document.getWordRangeAtPosition(cursor, /\\(?:begin|end|label)\{.*?\}|\\[a-zA-Z]+\{?|\\[()[\]]|\\\\/);
        if (r && r.start.isBefore(cursor) && r.end.isAfter(cursor)) {
            return true;
        }
        return false;
    }
    renderCursor(document, range) {
        const editor = vscode.window.activeTextEditor;
        const configuration = vscode.workspace.getConfiguration('latex-workshop');
        const conf = configuration.get('hover.preview.cursor.enabled');
        if (editor && conf && !this.isCursorInTeXCommand(document)) {
            const cursor = editor.selection.active;
            const symbol = configuration.get('hover.preview.cursor.symbol');
            const color = configuration.get('hover.preview.cursor.color');
            let sym = `{\\color{${this.color}}${symbol}}`;
            if (color !== 'auto') {
                sym = `{\\color{${color}}${symbol}}`;
            }
            if (range.contains(cursor) && !range.start.isEqual(cursor) && !range.end.isEqual(cursor)) {
                return document.getText(new vscode.Range(range.start, cursor)) + sym + document.getText(new vscode.Range(cursor, range.end));
            }
        }
        return document.getText(range);
    }
    mathjaxify(tex, envname, opt = { stripLabel: true }) {
        // remove TeX comments
        let s = tex.replace(/^\s*%.*\r?\n/mg, '');
        s = s.replace(/^((?:\\.|[^%])*).*$/mg, '$1');
        // remove \label{...}
        if (opt.stripLabel) {
            s = s.replace(/\\label\{.*?\}/g, '');
        }
        if (envname.match(/^(aligned|alignedat|array|Bmatrix|bmatrix|cases|CD|gathered|matrix|pmatrix|smallmatrix|split|subarray|Vmatrix|vmatrix)$/)) {
            s = '\\begin{equation}' + s + '\\end{equation}';
        }
        return s;
    }
    findHoverOnTex(document, position) {
        const envBeginPat = /\\begin\{(align|align\*|alignat|alignat\*|aligned|alignedat|array|Bmatrix|bmatrix|cases|CD|eqnarray|eqnarray\*|equation|equation\*|gather|gather\*|gathered|matrix|multline|multline\*|pmatrix|smallmatrix|split|subarray|Vmatrix|vmatrix)\}/;
        let r = document.getWordRangeAtPosition(position, envBeginPat);
        if (r) {
            const envname = this.getFirstRmemberedSubstring(document.getText(r), envBeginPat);
            return this.findHoverOnEnv(document, envname, r.start);
        }
        const parenBeginPat = /(\\\[|\\\(|\$\$)/;
        r = document.getWordRangeAtPosition(position, parenBeginPat);
        if (r) {
            const paren = this.getFirstRmemberedSubstring(document.getText(r), parenBeginPat);
            return this.findHoverOnParen(document, paren, r.start);
        }
        return this.findHoverOnInline(document, position);
    }
    findHoverOnRef(document, position, token, refData) {
        const docOfRef = textdocumentlike_1.TextDocumentLike.load(refData.file);
        const envBeginPatMathMode = /\\begin\{(align|align\*|alignat|alignat\*|eqnarray|eqnarray\*|equation|equation\*|gather|gather\*)\}/;
        const l = docOfRef.lineAt(refData.position.line).text;
        const pat = new RegExp('\\\\label\\{' + utils.escapeRegExp(token) + '\\}');
        const m = l.match(pat);
        if (m && m.index !== undefined) {
            const labelPos = new vscode.Position(refData.position.line, m.index);
            const beginPos = this.findBeginPair(docOfRef, envBeginPatMathMode, labelPos);
            if (beginPos) {
                const t = this.findHoverOnTex(docOfRef, beginPos);
                if (t) {
                    const beginEndRange = t.range;
                    const refRange = document.getWordRangeAtPosition(position, /\{.*?\}/);
                    if (refRange && beginEndRange.contains(labelPos)) {
                        t.range = refRange;
                        return t;
                    }
                }
            }
        }
        return undefined;
    }
    getFirstRmemberedSubstring(s, pat) {
        const m = s.match(pat);
        if (m && m[1]) {
            return m[1];
        }
        return 'never return here';
    }
    removeComment(line) {
        return line.replace(/^((?:\\.|[^%])*).*$/, '$1');
    }
    //  \begin{...}                \end{...}
    //             ^
    //             startPos1
    findEndPair(document, endPat, startPos1) {
        const currentLine = document.lineAt(startPos1).text.substring(startPos1.character);
        const l = this.removeComment(currentLine);
        let m = l.match(endPat);
        if (m && m.index !== undefined) {
            return new vscode.Position(startPos1.line, startPos1.character + m.index + m[0].length);
        }
        let lineNum = startPos1.line + 1;
        while (lineNum <= document.lineCount) {
            m = this.removeComment(document.lineAt(lineNum).text).match(endPat);
            if (m && m.index !== undefined) {
                return new vscode.Position(lineNum, m.index + m[0].length);
            }
            lineNum += 1;
        }
        return undefined;
    }
    //  \begin{...}                \end{...}
    //  ^                          ^
    //  return pos                 endPos1
    findBeginPair(document, beginPat, endPos1, limit = 20) {
        const currentLine = document.lineAt(endPos1).text.substr(0, endPos1.character);
        let l = this.removeComment(currentLine);
        let m = l.match(beginPat);
        if (m && m.index !== undefined) {
            return new vscode.Position(endPos1.line, m.index);
        }
        let lineNum = endPos1.line - 1;
        let i = 0;
        while (lineNum >= 0 && i < limit) {
            l = document.lineAt(lineNum).text;
            l = this.removeComment(l);
            m = l.match(beginPat);
            if (m && m.index !== undefined) {
                return new vscode.Position(lineNum, m.index);
            }
            lineNum -= 1;
            i += 1;
        }
        return undefined;
    }
    //  \begin{...}                \end{...}
    //  ^
    //  startPos
    findHoverOnEnv(document, envname, startPos) {
        const pattern = new RegExp('\\\\end\\{' + utils.escapeRegExp(envname) + '\\}');
        const startPos1 = new vscode.Position(startPos.line, startPos.character + envname.length + '\\begin{}'.length);
        const endPos = this.findEndPair(document, pattern, startPos1);
        if (endPos) {
            const range = new vscode.Range(startPos, endPos);
            return { texString: document.getText(range), range, envname };
        }
        return undefined;
    }
    //  \[                \]
    //  ^
    //  startPos
    findHoverOnParen(document, envname, startPos) {
        const pattern = envname === '\\[' ? /\\\]/ : envname === '\\(' ? /\\\)/ : /\$\$/;
        const startPos1 = new vscode.Position(startPos.line, startPos.character + envname.length);
        const endPos = this.findEndPair(document, pattern, startPos1);
        if (endPos) {
            const range = new vscode.Range(startPos, endPos);
            return { texString: document.getText(range), range, envname };
        }
        return undefined;
    }
    findHoverOnInline(document, position) {
        const currentLine = document.lineAt(position.line).text;
        const regex = /(?<!\$|\\)\$(?!\$)(?:\\.|[^\\])+?\$|\\\(.+?\\\)/;
        let s = currentLine;
        let base = 0;
        let m = s.match(regex);
        while (m) {
            if (m.index !== undefined) {
                const matchStart = base + m.index;
                const matchEnd = base + m.index + m[0].length;
                if (matchStart <= position.character && position.character <= matchEnd) {
                    const range = new vscode.Range(position.line, matchStart, position.line, matchEnd);
                    return { texString: document.getText(range), range, envname: '$' };
                }
                else {
                    base = matchEnd;
                    s = currentLine.substring(base);
                }
            }
            else {
                break;
            }
            m = s.match(regex);
        }
        return undefined;
    }
}
exports.MathPreview = MathPreview;
//# sourceMappingURL=mathpreview.js.map