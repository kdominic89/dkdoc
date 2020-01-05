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
                    value: document.createElement('li')
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

            this.noResult.appendChild(document.createTextNode('no result'));

            global.addEventListener('click', this.clear.bind(this));
            this.input.addEventListener('keydown',  this.search.bind(this));
            this.input.addEventListener('keypress', this.search.bind(this));
            this.input.addEventListener('keyup',    this.search.bind(this));
            this.input.addEventListener('paste',    this.search.bind(this));
            this.input.addEventListener('change',   this.search.bind(this));
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

        highlight(remove=false) {
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

        createListElement(item) {
            const listElement   = document.createElement('li');
            const highlightName = `${item.name.substring(0, item.start)}<strong>${item.name.substring(item.start, item.end)}</strong>${item.name.substring(item.end)}`;
            
            listElement.innerHTML = `<span class="search-name"><a href="${item.href}">${highlightName}</a></span><span class="search-group ${item.type}">${item.group}</span>`;
            listElement.onclick   = event => {
                window.location = item.href;
            };
            return listElement;
        }

        createList(list) {
            this.reset().clearSublist().show();

            const result = document.createElement('ul');

            result.onmouseenter = event => {
                this.highlight(true);
                this.input.blur();
                this.input.focus();
            };

            result.onmouseleave = event => {
                this.highlight();
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
            this.highlight();

            return result;
        }

        search(event) {
            if (event.keyCode === 38 || event.which === 38 || event.code === 'ArrowUp' || event.key === 'ArrowUp') {
                if (event.type === 'keydown' && this.sublist.length > 0) {
                    this.index -= 1;
                    this.index = this.index < 0 ? (this.sublist.length - 1) : this.index % this.sublist.length;
                    this.highlight();
                }
                return this;
            }

            if (event.keyCode === 40 || event.which === 40 || event.code === 'ArrowDown' || event.key === 'ArrowDown') {
                if (event.type === 'keydown' && this.sublist.length > 0) {
                    this.index = (this.index + 1) % this.sublist.length;
                    this.highlight();
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
