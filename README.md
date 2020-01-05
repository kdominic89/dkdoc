# DKDoc

DKDoc is a custom dark theme for JSDoc 3 and uses [CodeMirror](https://codemirror.net/doc/manual.html) to display the source code.

**NOTE**: Ueses [SimpleBar](https://grsmto.github.io/simplebar/) for the custom scrollbar.


### Installation
```
npm i @kdominic/dkdoc
```


## Feature
#### Navigation:
* Simple Searchbox for Classes / Members / Methods
* Collapsible


## Configuration
([*jsdoc page - configuration*](http://usejsdoc.org/about-configuring-jsdoc.html#incorporating-command-line-options-into-the-configuration-file))

### Template
```
"opts": {
    "template": "node_modules/@kdominic/dkdoc"
}
```

### Page Title
```
"templates": {
    "title": "{string} [title=Documentation]"
}
```

### Page Logo
#### Text:
```
"templates": {
    "logo": "{string|null|Object} [logo=DKDoc]"
}
```
OR
```
"templates": {
    "logo": {
        "type": "text",
        "src":  "{string} [src=DKDoc]"
    }
}
```

#### Image:

```
"templates": {
    "logo": {
        "type": "img",
        "src":  "{string} <path to image>"
    }
}
```

#### Make logo to link:
```
"templates": {
    "logo": {
        "type": "{string|null} [type=text]",
        "src":  "{string} [src=DKDoc]",
        "link": "{string} <page address>",
    }
}
```

#### Disable logo:
```
"templates": {
    "logo": null
}
```
**NOTE**: You can also set logo to "none" or logo.type to null or "none" to disable the logo.

### Collapsible Navigation
#### Text:
```
"templates": {
    "collapsibleNav": {boolean} [collapsibleNav=false]
}
```
