const doop     = require('jsdoc/util/doop');
const env      = require('jsdoc/env');
const fs       = require('jsdoc/fs');
const helper   = require('jsdoc/util/templateHelper');
const logger   = require('jsdoc/util/logger');
const path     = require('jsdoc/path');
const taffy    = require('taffydb').taffy;
const template = require('jsdoc/template');
const util     = require('util');

const nodeMinify = require('node-minify');


const htmlsafe = helper.htmlsafe;
const linkto = helper.linkto;
const resolveAuthorLinks = helper.resolveAuthorLinks;
const hasOwnProp = Object.prototype.hasOwnProperty;

let data;
let view;

let outdir = path.normalize(env.opts.destination);


function find(spec) {
    return helper.find(data, spec);
}

function tutoriallink(tutorial) {
    return helper.toTutorial(tutorial, null, { tag: 'em', classname: 'disabled', prefix: 'Tutorial: ' });
}

function getAncestorLinks(doclet) {
    return helper.getAncestorLinks(data, doclet);
}

function hashToLink(doclet, hash) {
    if (!/^(#.+)/.test(hash)) {
        return hash;
    }
    return `<a href="${helper.createLink(doclet).replace(/(#.+|$)/, hash)}">${hash}</a>`;
}

function needsSignature({ kind, type, meta }) {
    let needsSig = false;

    // function and class definitions always get a signature
    if (kind === 'function' || kind === 'class') {
        needsSig = true;
    }
    // typedefs that contain functions get a signature, too
    else if (kind === 'typedef' && type && type.names &&
        type.names.length) {
        for (let i = 0, l = type.names.length; i < l; i++) {
            if (type.names[i].toLowerCase() === 'function') {
                needsSig = true;
                break;
            }
        }
    }
    // and namespaces that are functions get a signature (but finding them is a bit messy)
    else if (kind === 'namespace' && meta && meta.code &&
        meta.code.type && meta.code.type.match(/[Ff]unction/)) {
        needsSig = true;
    }
    return needsSig;
}

function getSignatureAttributes({ optional, nullable }) {
    const attributes = [];

    if (optional) {
        attributes.push('opt');
    }

    if (nullable === true) {
        attributes.push('nullable');
    }
    else if (nullable === false) {
        attributes.push('non-null');
    }
    return attributes;
}

function updateItemName(item) {
    const attributes = getSignatureAttributes(item);
    let itemName = item.name || '';

    if (item.variable) {
        itemName = `&hellip;${itemName}`;
    }

    if (attributes && attributes.length) {
        itemName = util.format('%s<span class="signature-attributes">%s</span>', itemName, attributes.join(', '));
    }
    return itemName;
}

function addParamAttributes(params) {
    return params.filter(({name}) => name && !name.includes('.')).map(updateItemName);
}

function buildItemTypeStrings(item) {
    const types = [];

    if (item && item.type && item.type.names) {
        item.type.names.forEach(name => types.push(linkto(name, htmlsafe(name))));
    }
    return types;
}

function buildAttribsString(attribs) {
    let attribsString = '';

    if (attribs && attribs.length) {
        attribsString = htmlsafe(util.format('(%s) ', attribs.join(', ')));
    }
    return attribsString;
}

function addNonParamAttributes(items) {
    let types = [];
    items.forEach(item => types = types.concat(buildItemTypeStrings(item)));

    return types;
}

function addSignatureParams(f) {
    const params = f.params ? addParamAttributes(f.params) : [];

    f.signature = util.format('%s(%s)', (f.signature || ''), params.join(', '));
}

function addSignatureReturns(f) {
    const attribs           = [];
    let   attribsString     = '';
    let   returnTypes       = [];
    let   returnTypesString = '';
    const source            = f.yields || f.returns;

    // jam all the return-type attributes into an array. this could create odd results (for example,
    // if there are both nullable and non-nullable return types), but let's assume that most people
    // who use multiple @return tags aren't using Closure Compiler type annotations, and vice-versa.
    if (source) {
        source.forEach(item => {
            helper.getAttribs(item).forEach(attrib => {
                if (!attribs.includes(attrib)) {
                    attribs.push(attrib);
                }
            });
        });
        attribsString = buildAttribsString(attribs);
    }

    if (source) {
        returnTypes = addNonParamAttributes(source);
    }

    if (returnTypes.length) {
        returnTypesString = util.format(' &rarr; %s{%s}', attribsString, returnTypes.join('|'));
    }
    f.signature = `<span class="signature">${f.signature || ''}</span><span class="type-signature">${returnTypesString}</span>`;
}

function addSignatureTypes(f) {
    const types   = f.type ? buildItemTypeStrings(f) : [];
    const typeStr = types.length ? ` :${types.join('|')}` : '';

    f.signature = `${f.signature || ''}<span class="type-signature">${typeStr}</span>`;
}

function addAttribs(f) {
    const attribs       = helper.getAttribs(f);
    const attribsString = buildAttribsString(attribs);

    f.attribs = util.format('<span class="type-signature">%s</span>', attribsString);
}

function shortenPaths(files, commonPrefix) {
    Object.keys(files).forEach(file => {
        files[file].shortened = files[file].resolved.replace(commonPrefix, '')
            // always use forward slashes
            .replace(/\\/g, '/');
    });
    return files;
}

function getPathFromDoclet({ meta }) {
    if (!meta) {
        return null;
    }
    return meta.path && meta.path !== 'null' ? path.join(meta.path, meta.filename) : meta.filename;
}

function createHeader() {
    const header = {
        logo:  { type: 'text', src: 'DKDoc: '},
        title: 'Documentation'
    };
    
    if (env.conf.templates) {
        if (env.conf.templates.logo === null) {
            header.logo.type = 'none';
        }
        else if (typeof env.conf.templates.logo === 'string') {
            if (env.conf.templates.logo === 'none') {
                header.logo.type = 'none';
            }
            else {
                header.logo.src = env.conf.templates.logo;
            }
        }
        else if (typeof env.conf.templates.logo === 'object' && typeof env.conf.templates.logo.type === 'string' && typeof env.conf.templates.logo.src === 'string') {
            if (env.conf.templates.logo.type === null || env.conf.templates.logo.type === 'none') {
                header.logo.type = 'none';
            }
            else if (env.conf.templates.logo.type === 'text') {
                header.logo.src  = env.conf.templates.logo.src + (env.conf.templates.logo.src.endsWith(':') ? ' ' : ': ');
            }
            else if (env.conf.templates.logo.type === 'img' && fs.existsSync(env.conf.templates.logo.src)) {
                header.logo.type = 'img';
                header.logo.src  = env.conf.templates.logo.src;
            }

            if (typeof env.conf.templates.logo.link === 'string') {
                header.logo.link = env.conf.templates.logo.link;
            }
        }

        if (env.conf.templates.title) {
            header.title = env.conf.templates.title;
        }
    }
    return header;
}

function createFooter() {
    let footer = `Documentation generated by <a href="https://github.com/jsdoc/jsdoc">JSDoc ${env.version.number}</a>`;
    
    if (env.conf.templates && env.conf.templates.default && env.conf.templates.default.includeDate !== false) {
        footer += ` on ${(new Date())}`;
    }

    if (env.conf.templates.footer) {
        if (typeof env.conf.templates.footer === 'string') {
            footer = env.conf.templates.footer;
        }
    }
    return footer;
}

function copyCodemirror(outdir) {
    let   codemirrorPath = path.join(__dirname, '..', '..');
    const cb = (err, min) => {
        if (err) {
            console.error(err);
        }
    };

    if (path.basename(codemirrorPath) !== 'node_modules') {
        codemirrorPath = path.join(codemirrorPath, 'node_modules');
    }
    codemirrorPath = path.join(codemirrorPath, 'codemirror');

    if (fs.existsSync(codemirrorPath)) {
        if (!fs.existsSync(path.join(outdir, 'codemirror'))) {
            fs.mkdirSync(path.join(outdir, 'codemirror'));
        }

        try {
            fs.copyFileSync(path.join(codemirrorPath, 'AUTHORS'),   path.join(outdir, 'codemirror'));
            fs.copyFileSync(path.join(codemirrorPath, 'LICENSE'),   path.join(outdir, 'codemirror'));
            fs.copyFileSync(path.join(codemirrorPath, 'README.md'), path.join(outdir, 'codemirror'));
        }
        catch (er) {}
        
        nodeMinify.minify({
            compressor: 'uglify-es',
            input: [
                path.join(codemirrorPath, 'lib', 'codemirror.js'),
                path.join(codemirrorPath, 'mode', 'javascript', 'javascript.js'),
                path.join(codemirrorPath, 'addon', 'scroll', 'simplescrollbars.js')
            ],
            output: path.join(outdir, 'codemirror', 'codemirror.min.js'),
            callback: cb
        });
    
        nodeMinify.minify({
            compressor: 'crass',
            input: [
                path.join(codemirrorPath, 'lib', 'codemirror.css'),
                path.join(codemirrorPath, 'addon', 'scroll', 'simplescrollbars.css'),
            ],
            output: path.join(outdir, 'codemirror', 'codemirror.min.css'),
            callback: cb
        });
    }
    else {
        console.error('CodeMirror not exists.');
    }
}

function generate(title, docs, filename, resolveLinks) {
    const docData = { env, title, docs };
    let   html    = view.render('container.tmpl', docData);
    const outpath = path.join(outdir, filename);

    resolveLinks = resolveLinks !== false;

    if (resolveLinks) {
        html = helper.resolveLinks(html); // turn {@link foo} into <a href="foodoc.html">foo</a>
    }
    fs.writeFileSync(outpath, html, 'utf8');
}

function generateSourceFiles(sourceFiles, encoding = 'utf8') {
    Object.keys(sourceFiles).forEach(file => {
        let source;
        // links are keyed to the shortened path in each doclet's `meta.shortpath` property
        const sourceOutfile = helper.getUniqueFilename(sourceFiles[file].shortened);

        helper.registerLink(sourceFiles[file].shortened, sourceOutfile);

        try {
            source = {
                kind: 'source',
                code: helper.htmlsafe(fs.readFileSync(sourceFiles[file].resolved, encoding))
            };
        }
        catch (e) {
            logger.error('Error while generating source file %s: %s', file, e.message);
        }
        generate(`Source: ${sourceFiles[file].shortened}`, [source], sourceOutfile, false);
    });
}

/**
 * Look for classes or functions with the same name as modules (which indicates that the module
 * exports only that class or function), then attach the classes or functions to the `module`
 * property of the appropriate module doclets. The name of each class or function is also updated
 * for display purposes. This function mutates the original arrays.
 *
 * @private
 * @param {Array.<module:jsdoc/doclet.Doclet>} doclets - The array of classes and functions to check.
 * @param {Array.<module:jsdoc/doclet.Doclet>} modules - The array of module doclets to search.
 */
function attachModuleSymbols(doclets, modules) {
    const symbols = {};

    // build a lookup table
    doclets.forEach(symbol => {
        symbols[symbol.longname] = symbols[symbol.longname] || [];
        symbols[symbol.longname].push(symbol);
    });

    modules.forEach(module => {
        if (symbols[module.longname]) {
            module.modules = symbols[module.longname]
                // Only show symbols that have a description. Make an exception for classes, because
                // we want to show the constructor-signature heading no matter what.
                .filter(({description, kind}) => description || kind === 'class')
                .map(symbol => {
                    symbol = doop(symbol);

                    if (symbol.kind === 'class' || symbol.kind === 'function') {
                        symbol.name = `${symbol.name.replace('module:', '(require("')}"))`;
                    }
                    return symbol;
                });
        }
    });
}

function createNavListElement(content) {
    return `<li onclick="closeNav()">${content}</li>`;
}

function createNavSubelement(itemHeading, itemsNav) {
    let   collapsible = '';
    const headId      = itemHeading.trim().replace(/<a href=".*">|<\/a>/g, '').replace(' ', '_');

    itemsNav = !!itemsNav && itemsNav !== '' ? `<ul>${itemsNav}</ul>` : '';

    if (env.conf.templates && env.conf.templates.collapsibleNav) {
        collapsible = ' collapsible';
    }
    return (
        `<div class="subnav-container${collapsible}">
            <input id="nh_${headId}-trigger" type="checkbox" class="toggler" />
            <label for="nh_${headId}-trigger">
                <h4>${itemHeading}</h4>
                <div class="arrow-icon"><div></div></div>
            </label>
            ${itemsNav}
        </div>`
    );
}

function buildMemberNav(items, itemHeading, itemsSeen, linktoFn) {
    let nav = '';

    if (Array.isArray(items)) {
        let itemsNav = '';

        items.forEach(item => {
            let displayName;

            if (!hasOwnProp.call(item, 'longname')) {
                itemsNav += createNavListElement(linktoFn('', item.name));
            }
            else if (!hasOwnProp.call(itemsSeen, item.longname)) {
                if (env.conf.templates.default.useLongnameInNav) {
                    displayName = item.longname;
                }
                else {
                    displayName = item.name;
                }
                itemsNav += createNavListElement(linktoFn(item.longname, displayName.replace(/\b(module|event):/g, '')));

                itemsSeen[item.longname] = true;
            }
        });

        if (itemsNav !== '') {
            nav += createNavSubelement(itemHeading, itemsNav);
        }
    }
    return nav;
}

function linktoTutorial(longName, name) {
    return tutoriallink(name);
}

function linktoExternal(longName, name) {
    return linkto(longName, name.replace(/(^"|"$)/g, ''));
}

function resolveCustomAuthorLinks(a) {
    return resolveAuthorLinks(a).replace(/(&lt;|<)\/*p>/g, '');
}

function extractRawLink(longname, name) {
    let link = linkto(longname, name);
    link = link.match(/href=\"(?:http(s)?:\/\/)?[\w.-]+(?:\.[\w\.-]+)+[\w\-\._~:/?#[\]@!\$&'\(\)\*\+,;=.]+"/g)[0];
    link = link.substring(6, link.length-1);

    return link;
}

function createNavIndexSublist(group, kind, memberof) {
    const list = [];
    const subs = find({ kind, memberof });

    subs.forEach(sub => {
        list.push({ name: sub.name, group, type: kind, href: extractRawLink(sub.longname, sub.name) });
    });
    return list;
}

function createNavIndexList(groupList, groupName) {
    let list = [];

    groupList.forEach(obj => {
        if (groupName === 'Global') {
            list.push({ name: obj.name, group: groupName, type: obj.kind, href: extractRawLink(obj.longname, obj.name) });
        }
        else {
            list.push({ name: obj.name, type: '', group: groupName, href: extractRawLink(obj.longname, obj.name) });

            list = list.concat(createNavIndexSublist(obj.name, 'member',   obj.longname));
            list = list.concat(createNavIndexSublist(obj.name, 'function', obj.longname));
            list = list.concat(createNavIndexSublist(obj.name, 'event',    obj.longname));
            list = list.concat(createNavIndexSublist(obj.name, 'typedef',  obj.longname));
        }
    });
    return list;
}

function createNavIndex(members) {
    let list = createNavIndexList(members.modules, 'Module');
    list = list.concat(createNavIndexList(members.externals,  'External'));
    list = list.concat(createNavIndexList(members.namespaces, 'Namespace'));
    list = list.concat(createNavIndexList(members.classes,    'Class'));
    list = list.concat(createNavIndexList(members.interfaces, 'Interface'));
    list = list.concat(createNavIndexList(members.mixins,     'Mixin'));
    list = list.concat(createNavIndexList(members.globals,    'Global'));

    return JSON.stringify(list);
}

function generateNavIndex(outdir, members) {
    const navdir = path.join(outdir, 'nav');

    if (!fs.existsSync(navdir)) {
        fs.mkdirSync(navdir);
    }
    fs.writeFileSync(path.join(navdir, 'index.js'), `const navIndex=${createNavIndex(members)};`, 'utf8');
}

/**
 * Create the navigation sidebar.
 * @param {object} members The members that will be used to create the sidebar.
 * @param {array<object>} members.classes
 * @param {array<object>} members.externals
 * @param {array<object>} members.globals
 * @param {array<object>} members.mixins
 * @param {array<object>} members.modules
 * @param {array<object>} members.namespaces
 * @param {array<object>} members.tutorials
 * @param {array<object>} members.events
 * @param {array<object>} members.interfaces
 * @return {string} The HTML for the navigation sidebar.
 */
function buildNav(members) {
    const seen          = {};
    const seenTutorials = {};
    let   nav           = '';
    let   globalNav     = '';

    nav += '<section class="nav-section" data-simplebar>';
    nav += buildMemberNav(members.modules,    'Modules',    {},   linkto);
    nav += buildMemberNav(members.externals,  'Externals',  seen, linktoExternal);
    nav += buildMemberNav(members.namespaces, 'Namespaces', seen, linkto);
    nav += buildMemberNav(members.classes,    'Classes',    seen, linkto);
    nav += buildMemberNav(members.interfaces, 'Interfaces', seen, linkto);
    nav += buildMemberNav(members.events,     'Events',     seen, linkto);
    nav += buildMemberNav(members.mixins,     'Mixins',     seen, linkto);
    nav += buildMemberNav(members.tutorials,  'Tutorials',  seenTutorials, linktoTutorial);

    if (Array.isArray(members.globals)) {
        members.globals.forEach(({kind, longname, name}) => {
            if (kind !== 'typedef' && !hasOwnProp.call(seen, longname) ) {
                globalNav += createNavListElement(linkto(longname, name));
            }
            seen[longname] = true;
        });

        if (!globalNav) {
            nav += createNavSubelement(linkto('global', 'Global'));
        }
        else {
            nav += createNavSubelement('Global', globalNav);
        }
    }
    nav += '</section>';

    return nav;
}

function modifyReadme(readme) {
    return readme.replace(/ class="prettyprint source"/g, '');
}

/**
 * @param {TAFFY} taffyData See <http://taffydb.com/>.
 * @param {object} opts
 * @param {Tutorial} tutorials
 */
exports.publish = (taffyData, opts, tutorials) => {
    let classes;
    let conf;
    let externals;
    let files;
    let fromDir;
    let globalUrl;
    let indexUrl;
    let interfaces;
    let members;
    let mixins;
    let modules;
    let namespaces;
    let outputSourceFiles;
    let packageInfo;
    let packages;
    const sourceFilePaths = [];
    let sourceFiles = {};
    let staticFileFilter;
    let staticFilePaths;
    let staticFiles;
    let staticFileScanner;
    let templatePath;
    const header = createHeader();
    const footer = createFooter();

    data = taffyData;

    conf = env.conf.templates || {};
    conf.default = conf.default || {};

    templatePath = path.normalize(opts.template);
    view = new template.Template(path.join(templatePath, 'tmpl'));

    // claim some special filenames in advance, so the All-Powerful Overseer of Filename Uniqueness
    // doesn't try to hand them out later
    indexUrl = helper.getUniqueFilename('index');
    // don't call registerLink() on this one! 'index' is also a valid longname

    globalUrl = helper.getUniqueFilename('global');
    helper.registerLink('global', globalUrl);

    // set up templating
    view.layout = conf.default.layoutFile ? path.getResourcePath(path.dirname(conf.default.layoutFile), path.basename(conf.default.layoutFile) ) : 'layout.tmpl';

    // set up tutorials for helper
    helper.setTutorials(tutorials);

    data = helper.prune(data);
    data.sort('longname, version, since');
    helper.addEventListeners(data);

    data().each(doclet => {
        let sourcePath;

        doclet.attribs = '';

        if (doclet.examples) {
            doclet.examples = doclet.examples.map(example => {
                let caption;
                let code;

                if (example.match(/^\s*<caption>([\s\S]+?)<\/caption>(\s*[\n\r])([\s\S]+)$/i)) {
                    caption = RegExp.$1;
                    code    = RegExp.$3;
                }
                return {
                    caption: caption || '',
                    code:    code || example
                };
            });
        }
        if (doclet.see) {
            doclet.see.forEach((seeItem, i) => {
                doclet.see[i] = hashToLink(doclet, seeItem);
            });
        }

        // build a list of source files
        if (doclet.meta) {
            sourcePath = getPathFromDoclet(doclet);
            sourceFiles[sourcePath] = {
                resolved:  sourcePath,
                shortened: null
            };
            if (!sourceFilePaths.includes(sourcePath)) {
                sourceFilePaths.push(sourcePath);
            }
        }
    });

    // update outdir if necessary, then create outdir
    packageInfo = (find({ kind: 'package' }) || [])[0];
    if (packageInfo && packageInfo.name) {
        outdir = path.join(outdir, packageInfo.name, (packageInfo.version || ''));
    }
    fs.mkPath(outdir);

    // copy the template's static files to outdir
    fromDir = path.join(templatePath, 'static');
    staticFiles = fs.ls(fromDir, 3);

    staticFiles.forEach(fileName => {
        const toDir = fs.toDir( fileName.replace(fromDir, outdir) );

        fs.mkPath(toDir);
        fs.copyFileSync(fileName, toDir);
    });
    

    // copy logo
    if (header.logo.type === 'img') {
        fs.copyFileSync(header.logo.src, path.join(outdir, 'icons'));
        header.logo.src = `icons/${path.basename(header.logo.src)}`;
    }
    view.header = header;
    view.footer = footer;
    
    // copy and minify the codemirror files
    copyCodemirror(outdir);


    // copy user-specified static files to outdir
    if (conf.default.staticFiles) {
        // The canonical property name is `include`. We accept `paths` for backwards compatibility
        // with a bug in JSDoc 3.2.x.
        staticFilePaths   = conf.default.staticFiles.include || conf.default.staticFiles.paths || [];
        staticFileFilter  = new (require('jsdoc/src/filter').Filter)(conf.default.staticFiles);
        staticFileScanner = new (require('jsdoc/src/scanner').Scanner)();

        staticFilePaths.forEach(filePath => {
            let extraStaticFiles;

            filePath         = path.resolve(env.pwd, filePath);
            extraStaticFiles = staticFileScanner.scan([filePath], 10, staticFileFilter);

            extraStaticFiles.forEach(fileName => {
                const sourcePath = fs.toDir(filePath);
                const toDir      = fs.toDir( fileName.replace(sourcePath, outdir) );

                fs.mkPath(toDir);
                fs.copyFileSync(fileName, toDir);
            });
        });
    }

    if (sourceFilePaths.length) {
        sourceFiles = shortenPaths(sourceFiles, path.commonPrefix(sourceFilePaths));
    }
    data().each(doclet => {
        let docletPath;
        const url = helper.createLink(doclet);

        helper.registerLink(doclet.longname, url);

        // add a shortened version of the full path
        if (doclet.meta) {
            docletPath = getPathFromDoclet(doclet);
            docletPath = sourceFiles[docletPath].shortened;
            if (docletPath) {
                doclet.meta.shortpath = docletPath;
            }
        }
    });

    data().each(doclet => {
        const url = helper.longnameToUrl[doclet.longname];

        if (url.includes('#')) {
            doclet.id = helper.longnameToUrl[doclet.longname].split(/#/).pop();
        }
        else {
            doclet.id = doclet.name;
        }

        if (needsSignature(doclet)) {
            addSignatureParams(doclet);
            addSignatureReturns(doclet);
            addAttribs(doclet);
        }
    });

    // do this after the urls have all been generated
    data().each(doclet => {
        doclet.ancestors = getAncestorLinks(doclet);

        if (doclet.kind === 'member') {
            addSignatureTypes(doclet);
            addAttribs(doclet);
        }

        if (doclet.kind === 'constant') {
            addSignatureTypes(doclet);
            addAttribs(doclet);
            doclet.kind = 'member';
        }
    });

    members           = helper.getMembers(data);
    members.tutorials = tutorials.children;

    // output pretty-printed source files by default
    outputSourceFiles = conf.default && conf.default.outputSourceFiles !== false;

    // add template helpers
    view.find                     = find;
    view.linkto                   = linkto;
    view.resolveAuthorLinks       = resolveAuthorLinks;
    view.resolveCustomAuthorLinks = resolveCustomAuthorLinks;
    view.tutoriallink             = tutoriallink;
    view.htmlsafe                 = htmlsafe;
    view.outputSourceFiles        = outputSourceFiles;

    // once for all
    view.nav = buildNav(members);
    generateNavIndex(outdir, members);
    attachModuleSymbols(find({ longname: { left: 'module:' } }), members.modules);

    // generate the pretty-printed source files first so other pages can link to them
    if (outputSourceFiles) {
        generateSourceFiles(sourceFiles, opts.encoding);
    }

    if (members.globals.length) { generate('Global', [{ kind: 'globalobj' }], globalUrl); }

    // index page displays information from package.json and lists files
    files    = find({ kind: 'file' });
    packages = find({ kind: 'package' });

    generate(env.conf.templates.title || 'Home',
        packages.concat([
            {
                kind:     'mainpage',
                readme:   modifyReadme(opts.readme),
                longname: (opts.mainpagetitle) ? opts.mainpagetitle : 'Main Page'
            }
        ]).concat(files), indexUrl);

    // set up the lists that we'll use to generate pages
    classes    = taffy(members.classes);
    modules    = taffy(members.modules);
    namespaces = taffy(members.namespaces);
    mixins     = taffy(members.mixins);
    externals  = taffy(members.externals);
    interfaces = taffy(members.interfaces);

    Object.keys(helper.longnameToUrl).forEach(longname => {
        const myClasses    = helper.find(classes,    { longname });
        const myExternals  = helper.find(externals,  { longname });
        const myInterfaces = helper.find(interfaces, { longname });
        const myMixins     = helper.find(mixins,     { longname });
        const myModules    = helper.find(modules,    { longname });
        const myNamespaces = helper.find(namespaces, { longname });

        if (myModules.length) {
            generate(`Module: ${myModules[0].name}`, myModules, helper.longnameToUrl[longname]);
        }

        if (myClasses.length) {
            generate(`Class: ${myClasses[0].name}`, myClasses, helper.longnameToUrl[longname]);
        }

        if (myNamespaces.length) {
            generate(`Namespace: ${myNamespaces[0].name}`, myNamespaces, helper.longnameToUrl[longname]);
        }

        if (myMixins.length) {
            generate(`Mixin: ${myMixins[0].name}`, myMixins, helper.longnameToUrl[longname]);
        }

        if (myExternals.length) {
            generate(`External: ${myExternals[0].name}`, myExternals, helper.longnameToUrl[longname]);
        }

        if (myInterfaces.length) {
            generate(`Interface: ${myInterfaces[0].name}`, myInterfaces, helper.longnameToUrl[longname]);
        }
    });

    // TODO: move the tutorial functions to templateHelper.js
    function generateTutorial(title, tutorial, filename) {
        const tutorialData = {
            title:    title,
            header:   tutorial.title,
            content:  tutorial.parse(),
            children: tutorial.children
        };
        const tutorialPath = path.join(outdir, filename);
        let   html         = view.render('tutorial.tmpl', tutorialData);

        // yes, you can use {@link} in tutorials too!
        html = helper.resolveLinks(html); // turn {@link foo} into <a href="foodoc.html">foo</a>

        fs.writeFileSync(tutorialPath, html, 'utf8');
    }

    // tutorials can have only one parent so there is no risk for loops
    function saveChildren({children}) {
        children.forEach(child => {
            generateTutorial(`Tutorial: ${child.title}`, child, helper.tutorialToUrl(child.name));
            saveChildren(child);
        });
    }

    saveChildren(tutorials);
};
