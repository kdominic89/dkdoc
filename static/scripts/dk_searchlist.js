;(function(global) {
    class SearchList {
        constructor(parent, input, list) {
            let _onSearch = () => {};

            Object.defineProperties(this, {
                parent: {
                    value: parent
                },
                input: {
                    value: input
                },
                index: {
                    value:    0,
                    writable: true
                },
                list: {
                    value: list
                },
                sublist: {
                    value:    [],
                    writable: true
                },
                noResult: {
                    value: global.document.createElement('li')
                },
                onSearch: {
                    get: () => _onSearch,
                    set: onSearch => {
                        if (typeof onSearch === 'function') {
                            _onSearch = onSearch;
                        }
                    }
                }
            });

            this.noResult.appendChild(global.document.createTextNode('no result'));

            global.addEventListener('click', this.clear.bind(this));
            this.input.addEventListener('keydown',  this.search.bind(this));
            this.input.addEventListener('keypress', this.search.bind(this));
            this.input.addEventListener('keyup',    this.search.bind(this));
            this.input.addEventListener('paste',    this.search.bind(this));
            this.input.addEventListener('change',   this.search.bind(this));

            const links = document.getElementsByTagName('a');
            for (let link of links) {
                link.addEventListener('click', this._innerLink.bind(this));
            }
        }

        show() {
            this.parent.classList.add('show');
            return this;
        }

        hide() {
            this.parent.classList.remove('show');
            return this;
        }

        reset() {
            this.parent.classList.remove('show');

            while (this.parent.firstChild) {
                this.parent.removeChild(this.parent.firstChild);
            }
            return this;
        }

        clearSublist() {
            this.index   = 0;
            this.sublist = [];

            return this;
        }

        clear() {
            this.input.value = '';
            return this.reset().clearSublist();
        }

        highlightSearch(remove=false) {
            this.sublist.forEach((item, index) => {
                if (index === this.index && !remove) {
                    item.classList.add('highlight');
                    item.scrollIntoView();
                }
                else {
                    item.classList.remove('highlight');
                }
            });
            return this;
        }

        highlighElement(id, type='add') {
            const element = global.document.getElementById(id);

            if (!!element) {
                if (typeof element.classList[type] === 'function') {
                    element.classList[type]('highlight');
                }
                element.scrollIntoView();
            }
            return this;
        }

        highlighPage(type='add') {
            return this.highlighElement(global.location.hash.replace('#', ''), type);
        }

        _innerLink(event) {
            const oldLocation = global.location.href.replace(global.location.hash, '');
            const newLocation = event.target.href.replace(event.target.hash, '');

            if (oldLocation === newLocation) {
                this.highlighPage('remove');
                this.highlighElement(event.target.hash.replace('#', ''), 'add');
            }
        }

        createListElement(item) {
            const listElement   = global.document.createElement('li');
            const highlightName = `${item.name.substring(0, item.start)}<strong>${item.name.substring(item.start, item.end)}</strong>${item.name.substring(item.end)}`;
            
            listElement.innerHTML = `<span class="search-name"><a href="${item.href}">${highlightName}</a></span><span class="search-group ${item.type}">${item.group}</span>`;
            listElement.onclick   = event => {
                this.highlighPage('remove');
                global.location.href = item.href;
                this.highlighPage();
            };
            return listElement;
        }

        createList(list) {
            this.reset().clearSublist().show();

            const result = global.document.createElement('ul');

            result.onmouseenter = () => {
                this.highlightSearch(true);
                this.input.blur();
                this.input.focus();
            };

            result.onmouseleave = () => {
                this.highlightSearch();
            };

            if (list.length > 0) {
                list.forEach((item, index) => {
                    this.sublist.push(this.createListElement(item, index));
                    result.appendChild(this.sublist[this.sublist.length - 1]);
                });
            }
            else {
                result.appendChild(this.noResult);
            }
            this.highlightSearch();

            return result;
        }

        search(event) {
            if (event.keyCode === 38 || event.which === 38 || event.code === 'ArrowUp' || event.key === 'ArrowUp') {
                if (event.type === 'keydown' && this.sublist.length > 0) {
                    this.index -= 1;
                    this.index = this.index < 0 ? (this.sublist.length - 1) : this.index % this.sublist.length;
                    this.highlightSearch();
                }
                return this;
            }

            if (event.keyCode === 40 || event.which === 40 || event.code === 'ArrowDown' || event.key === 'ArrowDown') {
                if (event.type === 'keydown' && this.sublist.length > 0) {
                    this.index = (this.index + 1) % this.sublist.length;
                    this.highlightSearch();
                }
                return this;
            }

            if (event.charCode === 13 || event.keyCode === 13 || event.which === 13 || event.code === 'Enter' || event.key === 'Enter') {
                if (event.type === 'keydown' && this.sublist.length > 0) {
                    this.sublist[this.index].click();
                }
                return this;
            }

            const input = this.input.value.trim().toLowerCase();

            if (input === '') {
                return this.clear();
            }
            const list = [];

            this.list.forEach(item => {
                const testName = item.name.toLowerCase();

                if (testName.includes(input)) {
                    const start = testName.indexOf(input);
                    item.start  = start;
                    item.end    = start + input.length;
                    list.push(item);
                }
            });
            this.parent.appendChild(this.createList(list));
            this.onSearch(list);

            return this;
        }
    }
    global.SearchList = SearchList;
})(window);
