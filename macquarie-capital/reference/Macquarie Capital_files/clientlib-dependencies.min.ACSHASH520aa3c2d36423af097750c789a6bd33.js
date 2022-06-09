/*******************************************************************************
 * Copyright 2018 Adobe
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ******************************************************************************/
(function () {
    "use strict";

    var NS = "cmp";
    var IS = "carousel";

    var keyCodes = {
        SPACE: 32,
        END: 35,
        HOME: 36,
        ARROW_LEFT: 37,
        ARROW_UP: 38,
        ARROW_RIGHT: 39,
        ARROW_DOWN: 40
    };

    var selectors = {
        self: "[data-" + NS + '-is="' + IS + '"]'
    };

    var properties = {
        /**
         * Determines whether the Carousel will automatically transition between slides
         *
         * @memberof Carousel
         * @type {Boolean}
         * @default false
         */
        "autoplay": {
            "default": false,
            "transform": function (value) {
                return !(value === null || typeof value === "undefined");
            }
        },
        /**
         * Duration (in milliseconds) before automatically transitioning to the next slide
         *
         * @memberof Carousel
         * @type {Number}
         * @default 5000
         */
        "delay": {
            "default": 5000,
            "transform": function (value) {
                value = parseFloat(value);
                return !isNaN(value) ? value : null;
            }
        },
        /**
         * Determines whether automatic pause on hovering the carousel is disabled
         *
         * @memberof Carousel
         * @type {Boolean}
         * @default false
         */
        "autopauseDisabled": {
            "default": false,
            "transform": function (value) {
                return !(value === null || typeof value === "undefined");
            }
        }
    };

    /**
     * Carousel Configuration
     *
     * @typedef {Object} CarouselConfig Represents a Carousel configuration
     * @property {HTMLElement} element The HTMLElement representing the Carousel
     * @property {Object} options The Carousel options
     */

    /**
     * Carousel
     *
     * @class Carousel
     * @classdesc An interactive Carousel component for navigating a list of generic items
     * @param {CarouselConfig} config The Carousel configuration
     */
    function Carousel(config) {
        var that = this;

        if (config && config.element) {
            init(config);
        }

        /**
         * Initializes the Carousel
         *
         * @private
         * @param {CarouselConfig} config The Carousel configuration
         */
        function init(config) {
            // prevents multiple initialization
            config.element.removeAttribute("data-" + NS + "-is");

            setupProperties(config.options);
            cacheElements(config.element);

            that._active = 0;
            that._paused = false;

            if (that._elements.item) {
                refreshActive();
                bindEvents();
                resetAutoplayInterval();
                refreshPlayPauseActions();
            }

            if (window.Granite && window.Granite.author && window.Granite.author.MessageChannel) {
                /*
                 * Editor message handling:
                 * - subscribe to "cmp.panelcontainer" message requests sent by the editor frame
                 * - check that the message data panel container type is correct and that the id (path) matches this specific Carousel component
                 * - if so, route the "navigate" operation to enact a navigation of the Carousel based on index data
                 */
                new window.Granite.author.MessageChannel("cqauthor", window).subscribeRequestMessage("cmp.panelcontainer", function (message) {
                    if (message.data && message.data.type === "cmp-carousel" && message.data.id === that._elements.self.dataset["cmpPanelcontainerId"]) {
                        if (message.data.operation === "navigate") {
                            navigate(message.data.index);
                        }
                    }
                });
            }
        }

        /**
         * Caches the Carousel elements as defined via the {@code data-carousel-hook="ELEMENT_NAME"} markup API
         *
         * @private
         * @param {HTMLElement} wrapper The Carousel wrapper element
         */
        function cacheElements(wrapper) {
            that._elements = {};
            that._elements.self = wrapper;
            var hooks = that._elements.self.querySelectorAll("[data-" + NS + "-hook-" + IS + "]");

            for (var i = 0; i < hooks.length; i++) {
                var hook = hooks[i];
                var capitalized = IS;
                capitalized = capitalized.charAt(0).toUpperCase() + capitalized.slice(1);
                var key = hook.dataset[NS + "Hook" + capitalized];
                if (that._elements[key]) {
                    if (!Array.isArray(that._elements[key])) {
                        var tmp = that._elements[key];
                        that._elements[key] = [tmp];
                    }
                    that._elements[key].push(hook);
                } else {
                    that._elements[key] = hook;
                }
            }
        }

        /**
         * Sets up properties for the Carousel based on the passed options.
         *
         * @private
         * @param {Object} options The Carousel options
         */
        function setupProperties(options) {
            that._properties = {};

            for (var key in properties) {
                if (properties.hasOwnProperty(key)) {
                    var property = properties[key];
                    var value = null;

                    if (options && options[key] != null) {
                        value = options[key];

                        // transform the provided option
                        if (property && typeof property.transform === "function") {
                            value = property.transform(value);
                        }
                    }

                    if (value === null) {
                        // value still null, take the property default
                        value = properties[key]["default"];
                    }

                    that._properties[key] = value;
                }
            }
        }

        /**
         * Binds Carousel event handling
         *
         * @private
         */
        function bindEvents() {
            if (that._elements["previous"]) {
                that._elements["previous"].addEventListener("click", function () {
                    navigate(getPreviousIndex());
                });
            }

            if (that._elements["next"]) {
                that._elements["next"].addEventListener("click", function () {
                    navigate(getNextIndex());
                });
            }

            var indicators = that._elements["indicator"];
            if (indicators) {
                for (var i = 0; i < indicators.length; i++) {
                    (function (index) {
                        indicators[i].addEventListener("click", function (event) {
                            navigateAndFocusIndicator(index);
                        });
                    })(i);
                }
            }

            if (that._elements["pause"]) {
                if (that._properties.autoplay) {
                    that._elements["pause"].addEventListener("click", onPauseClick);
                }
            }

            if (that._elements["play"]) {
                if (that._properties.autoplay) {
                    that._elements["play"].addEventListener("click", onPlayClick);
                }
            }

            that._elements.self.addEventListener("keydown", onKeyDown);

            if (!that._properties.autopauseDisabled) {
                that._elements.self.addEventListener("mouseenter", onMouseEnter);
                that._elements.self.addEventListener("mouseleave", onMouseLeave);
            }
        }

        /**
         * Handles carousel keydown events
         *
         * @private
         * @param {Object} event The keydown event
         */
        function onKeyDown(event) {
            var index = that._active;
            var lastIndex = that._elements["indicator"].length - 1;

            switch (event.keyCode) {
                case keyCodes.ARROW_LEFT:
                case keyCodes.ARROW_UP:
                    event.preventDefault();
                    if (index > 0) {
                        navigateAndFocusIndicator(index - 1);
                    }
                    break;
                case keyCodes.ARROW_RIGHT:
                case keyCodes.ARROW_DOWN:
                    event.preventDefault();
                    if (index < lastIndex) {
                        navigateAndFocusIndicator(index + 1);
                    }
                    break;
                case keyCodes.HOME:
                    event.preventDefault();
                    navigateAndFocusIndicator(0);
                    break;
                case keyCodes.END:
                    event.preventDefault();
                    navigateAndFocusIndicator(lastIndex);
                    break;
                case keyCodes.SPACE:
                    if (that._properties.autoplay && (event.target !== that._elements["previous"] && event.target !== that._elements["next"])) {
                        event.preventDefault();
                        if (!that._paused) {
                            pause();
                        } else {
                            play();
                        }
                    }
                    if (event.target === that._elements["pause"]) {
                        that._elements["play"].focus();
                    }
                    if (event.target === that._elements["play"]) {
                        that._elements["pause"].focus();
                    }
                    break;
                default:
                    return;
            }
        }

        /**
         * Handles carousel mouseenter events
         *
         * @private
         * @param {Object} event The mouseenter event
         */
        function onMouseEnter(event) {
            clearAutoplayInterval();
            document.querySelector('.cmp-carousel__action--pause') && document.querySelector('.cmp-carousel__action--pause').click();
        }

        /**
         * Handles carousel mouseleave events
         *
         * @private
         * @param {Object} event The mouseleave event
         */
        function onMouseLeave(event) {
            resetAutoplayInterval();
            document.querySelector('.cmp-carousel__action--play') && document.querySelector('.cmp-carousel__action--play').click();
        }

        /**
         * Handles pause element click events
         *
         * @private
         * @param {Object} event The click event
         */
        function onPauseClick(event) {
            pause();
            that._elements["play"].focus();
        }

        /**
         * Handles play element click events
         *
         * @private
         * @param {Object} event The click event
         */
        function onPlayClick() {
            play();
            that._elements["pause"].focus();
        }

        /**
         * Pauses the playing of the Carousel. Sets {@code Carousel#_paused} marker.
         * Only relevant when autoplay is enabled
         *
         * @private
         */
        function pause() {
            that._paused = true;
            clearAutoplayInterval();
            refreshPlayPauseActions();
        }

        /**
         * Enables the playing of the Carousel. Sets {@code Carousel#_paused} marker.
         * Only relevant when autoplay is enabled
         *
         * @private
         */
        function play() {
            that._paused = false;

            // If the Carousel is hovered, don't begin auto transitioning until the next mouse leave event
            var hovered = false;
            if (that._elements.self.parentElement) {
                hovered = that._elements.self.parentElement.querySelector(":hover") === that._elements.self;
            }
            if (that._properties.autopauseDisabled || !hovered) {
                resetAutoplayInterval();
            }

            refreshPlayPauseActions();
        }

        /**
         * Refreshes the play/pause action markup based on the {@code Carousel#_paused} state
         *
         * @private
         */
        function refreshPlayPauseActions() {
            setActionDisabled(that._elements["pause"], that._paused);
            setActionDisabled(that._elements["play"], !that._paused);
        }

        /**
         * Refreshes the item markup based on the current {@code Carousel#_active} index
         *
         * @private
         */
        function refreshActive() {
            var items = that._elements["item"];
            var indicators = that._elements["indicator"];

            if (items) {
                if (Array.isArray(items)) {
                    for (var i = 0; i < items.length; i++) {
                        if (i === parseInt(that._active)) {
                            items[i].classList.add("cmp-carousel__item--active");
                            items[i].removeAttribute("aria-hidden");
                            indicators[i].classList.add("cmp-carousel__indicator--active");
                            indicators[i].setAttribute("aria-selected", true);
                            indicators[i].setAttribute("tabindex", "0");
                        } else {
                            items[i].classList.remove("cmp-carousel__item--active");
                            items[i].setAttribute("aria-hidden", true);
                            indicators[i].classList.remove("cmp-carousel__indicator--active");
                            indicators[i].setAttribute("aria-selected", false);
                            indicators[i].setAttribute("tabindex", "-1");
                        }
                    }
                } else {
                    // only one item
                    items.classList.add("cmp-carousel__item--active");
                    indicators.classList.add("cmp-carousel__indicator--active");
                }
            }
        }

        /**
         * Focuses the element and prevents scrolling the element into view
         *
         * @param {HTMLElement} element Element to focus
         */
        function focusWithoutScroll(element) {
            var x = window.scrollX || window.pageXOffset;
            var y = window.scrollY || window.pageYOffset;
            element.focus();
            window.scrollTo(x, y);
        }

        /**
         * Retrieves the next active index, with looping
         *
         * @private
         * @returns {Number} Index of the next carousel item
         */
        function getNextIndex() {
            return that._active === (that._elements["item"].length - 1) ? 0 : that._active + 1;
        }

        /**
         * Retrieves the previous active index, with looping
         *
         * @private
         * @returns {Number} Index of the previous carousel item
         */
        function getPreviousIndex() {
            return that._active === 0 ? (that._elements["item"].length - 1) : that._active - 1;
        }

        /**
         * Navigates to the item at the provided index
         *
         * @private
         * @param {Number} index The index of the item to navigate to
         */
        function navigate(index) {
            if (index < 0 || index > (that._elements["item"].length - 1)) {
                return;
            }

            //Remove any loaded progress bars unless the carousel is paused
            if (document.querySelector('.temp-carousel') && !that._paused) {
                document.querySelector('.temp-carousel').remove();
            }

            that._active = index;

            refreshActive();
            resetAutoplayInterval();

            const activeVideo = document.querySelector('.cmp-carousel__item--active video');

            //Restart the video every time a slide is navigated
            try {
                if(activeVideo) {
                  activeVideo.pause();
                  activeVideo.currentTime = 0;
                  activeVideo.play();
                }
            } catch(error) {
                // AEM-2189 catch and suppress error due to IE not decoding already loaded and ready video.
                // AEM-2306
            }

            // reset the autoplay transition interval following navigation, if not already hovering the carousel
            if (that._elements.self.parentElement) {
                if (that._elements.self.parentElement.querySelector(":hover") !== that._elements.self) {
                    resetAutoplayInterval();
                }
            }
        }

        /**
         * Navigates to the item at the provided index and ensures the active indicator gains focus
         *
         * @private
         * @param {Number} index The index of the item to navigate to
         */
        function navigateAndFocusIndicator(index) {
            navigate(index);
            focusWithoutScroll(that._elements["indicator"][index]);
        }

        /**
         * Starts/resets automatic slide transition interval
         *
         * @private
         */
        function resetAutoplayInterval() {
            if (!document.querySelector('.cmp-carousel') || that._paused || !that._properties.autoplay) {
                return;
            }

            //Assign the elapsed duration to "delay" instead of the original interval duration
            that._properties.delay = document.querySelector('.cmp-carousel').getAttribute('data-cmp-left') ? document.querySelector('.cmp-carousel').getAttribute('data-cmp-left') :
                document.querySelector('.cmp-carousel').getAttribute('data-cmp-delay');
            document.querySelector('.cmp-carousel').removeAttribute('data-cmp-left');

            clearAutoplayInterval();
            that._autoplayIntervalId = window.setInterval(function () {
                if (document.visibilityState && document.hidden) {
                    return;
                }
                var indicators = that._elements["indicators"];
                if (indicators !== document.activeElement && indicators.contains(document.activeElement)) {
                    // if an indicator has focus, ensure we switch focus following navigation
                    navigateAndFocusIndicator(getNextIndex());
                } else {
                    navigate(getNextIndex());
                }
            }, that._properties.delay);
        }

        /**
         * Clears/pauses automatic slide transition interval
         *
         * @private
         */
        function clearAutoplayInterval() {
            window.clearInterval(that._autoplayIntervalId);
            that._autoplayIntervalId = null;
        }

        /**
         * Sets the disabled state for an action and toggles the appropriate CSS classes
         *
         * @private
         * @param {HTMLElement} action Action to disable
         * @param {Boolean} [disable] {@code true} to disable, {@code false} to enable
         */
        function setActionDisabled(action, disable) {
            if (!action) {
                return;
            }
            if (disable !== false) {
                action.disabled = true;
                action.classList.add("cmp-carousel__action--disabled");
            } else {
                action.disabled = false;
                action.classList.remove("cmp-carousel__action--disabled");
            }
        }
    }

    /**
     * Reads options data from the Carousel wrapper element, defined via {@code data-cmp-*} data attributes
     *
     * @private
     * @param {HTMLElement} element The Carousel element to read options data from
     * @returns {Object} The options read from the component data attributes
     */
    function readData(element) {
        var data = element.dataset;
        var options = [];
        var capitalized = IS;
        capitalized = capitalized.charAt(0).toUpperCase() + capitalized.slice(1);
        var reserved = ["is", "hook" + capitalized];

        for (var key in data) {
            if (data.hasOwnProperty(key)) {
                var value = data[key];

                if (key.indexOf(NS) === 0) {
                    key = key.slice(NS.length);
                    key = key.charAt(0).toLowerCase() + key.substring(1);

                    if (reserved.indexOf(key) === -1) {
                        options[key] = value;
                    }
                }
            }
        }

        return options;
    }

    /**
     * Document ready handler and DOM mutation observers. Initializes Carousel components as necessary.
     *
     * @private
     */
    function onDocumentReady() {
        var elements = document.querySelectorAll(selectors.self);
        for (var i = 0; i < elements.length; i++) {
            new Carousel({element: elements[i], options: readData(elements[i])});
        }

        var MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;
        var body = document.querySelector("body");
        var observer = new MutationObserver(function (mutations) {
            mutations.forEach(function (mutation) {
                // needed for IE
                var nodesArray = [].slice.call(mutation.addedNodes);
                if (nodesArray.length > 0) {
                    nodesArray.forEach(function (addedNode) {
                        if (addedNode.querySelectorAll) {
                            var elementsArray = [].slice.call(addedNode.querySelectorAll(selectors.self));
                            elementsArray.forEach(function (element) {
                                new Carousel({element: element, options: readData(element)});
                            });
                        }
                    });
                }
            });
        });

        observer.observe(body, {
            subtree: true,
            childList: true,
            characterData: true
        });
    }

    if (document.readyState !== "loading") {
        onDocumentReady();
    } else {
        document.addEventListener("DOMContentLoaded", onDocumentReady);
    }

}());

/*******************************************************************************
 * Copyright 2019 Adobe
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ******************************************************************************/

/**
 * Element.matches()
 * https://developer.mozilla.org/enUS/docs/Web/API/Element/matches#Polyfill
 */
if (!Element.prototype.matches) {
    Element.prototype.matches = Element.prototype.msMatchesSelector || Element.prototype.webkitMatchesSelector;
}

// eslint-disable-next-line valid-jsdoc
/**
 * Element.closest()
 * https://developer.mozilla.org/enUS/docs/Web/API/Element/closest#Polyfill
 */
if (!Element.prototype.closest) {
    Element.prototype.closest = function(s) {
        "use strict";
        var el = this;
        if (!document.documentElement.contains(el)) {
            return null;
        }
        do {
            if (el.matches(s)) {
                return el;
            }
            el = el.parentElement || el.parentNode;
        } while (el !== null && el.nodeType === 1);
        return null;
    };
}

/*******************************************************************************
 * Copyright 2019 Adobe
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ******************************************************************************/
(function() {
    "use strict";

    var NS = "cmp";
    var IS = "accordion";

    var keyCodes = {
        ENTER: 13,
        SPACE: 32,
        END: 35,
        HOME: 36,
        ARROW_LEFT: 37,
        ARROW_UP: 38,
        ARROW_RIGHT: 39,
        ARROW_DOWN: 40
    };

    var selectors = {
        self: "[data-" +  NS + '-is="' + IS + '"]'
    };

    var cssClasses = {
        button: {
            disabled: "cmp-accordion__button--disabled",
            expanded: "cmp-accordion__button--expanded"
        },
        panel: {
            hidden: "cmp-accordion__panel--hidden",
            expanded: "cmp-accordion__panel--expanded"
        }
    };

    var dataAttributes = {
        item: {
            expanded: "data-cmp-expanded"
        }
    };

    var properties = {
        /**
         * Determines whether a single accordion item is forced to be expanded at a time.
         * Expanding one item will collapse all others.
         *
         * @memberof Accordion
         * @type {Boolean}
         * @default false
         */
        "singleExpansion": {
            "default": false,
            "transform": function(value) {
                return !(value === null || typeof value === "undefined");
            }
        }
    };

    /**
     * Accordion Configuration.
     *
     * @typedef {Object} AccordionConfig Represents an Accordion configuration
     * @property {HTMLElement} element The HTMLElement representing the Accordion
     * @property {Object} options The Accordion options
     */

    /**
     * Accordion.
     *
     * @class Accordion
     * @classdesc An interactive Accordion component for toggling panels of related content
     * @param {AccordionConfig} config The Accordion configuration
     */
    function Accordion(config) {
        var that = this;

        if (config && config.element) {
            init(config);
        }

        /**
         * Initializes the Accordion.
         *
         * @private
         * @param {AccordionConfig} config The Accordion configuration
         */
        function init(config) {
            // prevents multiple initialization
            config.element.removeAttribute("data-" + NS + "-is");

            setupProperties(config.options);
            cacheElements(config.element);

            if (that._elements["item"]) {
                // ensures multiple element types are arrays.
                that._elements["item"] = Array.isArray(that._elements["item"]) ? that._elements["item"] : [that._elements["item"]];
                that._elements["button"] = Array.isArray(that._elements["button"]) ? that._elements["button"] : [that._elements["button"]];
                that._elements["panel"] = Array.isArray(that._elements["panel"]) ? that._elements["panel"] : [that._elements["panel"]];

                if (that._properties.singleExpansion) {
                    var expandedItems = getExpandedItems();
                    // no expanded item annotated, force the first item to display.
                    if (expandedItems.length === 0) {
                        toggle(0);
                    }
                    // multiple expanded items annotated, display the last item open.
                    if (expandedItems.length > 1) {
                        toggle(expandedItems.length - 1);
                    }
                }

                refreshItems();
                bindEvents();

                if (window.Granite && window.Granite.author && window.Granite.author.MessageChannel) {
                    /*
                     * Editor message handling:
                     * - subscribe to "cmp.panelcontainer" message requests sent by the editor frame
                     * - check that the message data panel container type is correct and that the id (path) matches this specific Accordion component
                     * - if so, route the "navigate" operation to enact a navigation of the Accordion based on index data
                     */
                    new window.Granite.author.MessageChannel("cqauthor", window).subscribeRequestMessage("cmp.panelcontainer", function(message) {
                        if (message.data && message.data.type === "cmp-accordion" && message.data.id === that._elements.self.dataset["cmpPanelcontainerId"]) {
                            if (message.data.operation === "navigate") {
                                // switch to single expansion mode when navigating in edit mode.
                                var singleExpansion = that._properties.singleExpansion;
                                that._properties.singleExpansion = true;
                                toggle(message.data.index);

                                // revert to the configured state.
                                that._properties.singleExpansion = singleExpansion;
                            }
                        }
                    });
                }
            }
        }

        /**
         * Caches the Accordion elements as defined via the {@code data-accordion-hook="ELEMENT_NAME"} markup API.
         *
         * @private
         * @param {HTMLElement} wrapper The Accordion wrapper element
         */
        function cacheElements(wrapper) {
            that._elements = {};
            that._elements.self = wrapper;
            var hooks = that._elements.self.querySelectorAll("[data-" + NS + "-hook-" + IS + "]");

            for (var i = 0; i < hooks.length; i++) {
                var hook = hooks[i];
                if (hook.closest("." + NS + "-" + IS) === that._elements.self) { // only process own accordion elements
                    var capitalized = IS;
                    capitalized = capitalized.charAt(0).toUpperCase() + capitalized.slice(1);
                    var key = hook.dataset[NS + "Hook" + capitalized];
                    if (that._elements[key]) {
                        if (!Array.isArray(that._elements[key])) {
                            var tmp = that._elements[key];
                            that._elements[key] = [tmp];
                        }
                        that._elements[key].push(hook);
                    } else {
                        that._elements[key] = hook;
                    }
                }
            }
        }

        /**
         * Sets up properties for the Accordion based on the passed options.
         *
         * @private
         * @param {Object} options The Accordion options
         */
        function setupProperties(options) {
            that._properties = {};

            for (var key in properties) {
                if (properties.hasOwnProperty(key)) {
                    var property = properties[key];
                    var value = null;

                    if (options && options[key] != null) {
                        value = options[key];

                        // transform the provided option
                        if (property && typeof property.transform === "function") {
                            value = property.transform(value);
                        }
                    }

                    if (value === null) {
                        // value still null, take the property default
                        value = properties[key]["default"];
                    }

                    that._properties[key] = value;
                }
            }
        }

        /**
         * Binds Accordion event handling.
         *
         * @private
         */
        function bindEvents() {
            var buttons = that._elements["button"];
            if (buttons) {
                for (var i = 0; i < buttons.length; i++) {
                    (function(index) {
                        buttons[i].addEventListener("click", function(event) {
                            toggle(index);
                            focusButton(index);
                        });
                        buttons[i].addEventListener("keydown", function(event) {
                            onButtonKeyDown(event, index);
                        });
                    })(i);
                }
            }
        }

        /**
         * Handles button keydown events.
         *
         * @private
         * @param {Object} event The keydown event
         * @param {Number} index The index of the button triggering the event
         */
        function onButtonKeyDown(event, index) {
            var lastIndex = that._elements["button"].length - 1;

            switch (event.keyCode) {
                case keyCodes.ARROW_LEFT:
                case keyCodes.ARROW_UP:
                    event.preventDefault();
                    if (index > 0) {
                        focusButton(index - 1);
                    }
                    break;
                case keyCodes.ARROW_RIGHT:
                case keyCodes.ARROW_DOWN:
                    event.preventDefault();
                    if (index < lastIndex) {
                        focusButton(index + 1);
                    }
                    break;
                case keyCodes.HOME:
                    event.preventDefault();
                    focusButton(0);
                    break;
                case keyCodes.END:
                    event.preventDefault();
                    focusButton(lastIndex);
                    break;
                case keyCodes.ENTER:
                case keyCodes.SPACE:
                    event.preventDefault();
                    toggle(index);
                    focusButton(index);
                    break;
                default:
                    return;
            }
        }

        /**
         * General handler for toggle of an item.
         *
         * @private
         * @param {Number} index The index of the item to toggle
         */
        function toggle(index) {
            var item = that._elements["item"][index];
            if (item) {
                if (that._properties.singleExpansion) {
                    // ensure only a single item is expanded if single expansion is enabled.
                    for (var i = 0; i < that._elements["item"].length; i++) {
                        if (that._elements["item"][i] !== item) {
                            var expanded = getItemExpanded(that._elements["item"][i]);
                            if (expanded) {
                                setItemExpanded(that._elements["item"][i], false);
                            }
                        }
                    }
                    setItemExpanded(item, true);
                } else {
                    setItemExpanded(item, !getItemExpanded(item));
                }
            }
        }

        /**
         * Sets an item's expanded state based on the provided flag and refreshes its internals.
         *
         * @private
         * @param {HTMLElement} item The item to mark as expanded, or not expanded
         * @param {Boolean} expanded true to mark the item expanded, false otherwise
         */
        function setItemExpanded(item, expanded) {
            if (expanded) {
                item.setAttribute(dataAttributes.item.expanded, "");
            } else {
                item.removeAttribute(dataAttributes.item.expanded);
            }
            refreshItem(item);
        }

        /**
         * Gets an item's expanded state.
         *
         * @private
         * @param {HTMLElement} item The item for checking its expanded state
         * @returns {Boolean} true if the item is expanded, false otherwise
         */
        function getItemExpanded(item) {
            return item && item.dataset && item.dataset["cmpExpanded"] !== undefined;
        }

        /**
         * Refreshes an item based on its expanded state.
         *
         * @private
         * @param {HTMLElement} item The item to refresh
         */
        function refreshItem(item) {
            var expanded = getItemExpanded(item);
            if (expanded) {
                expandItem(item);
            } else {
                collapseItem(item);
            }
        }

        /**
         * Refreshes all items based on their expanded state.
         *
         * @private
         */
        function refreshItems() {
            for (var i = 0; i < that._elements["item"].length; i++) {
                refreshItem(that._elements["item"][i]);
            }
        }

        /**
         * Returns all expanded items.
         *
         * @private
         * @returns {HTMLElement[]} The expanded items
         */
        function getExpandedItems() {
            var expandedItems = [];

            for (var i = 0; i < that._elements["item"].length; i++) {
                var item = that._elements["item"][i];
                var expanded = getItemExpanded(item);
                if (expanded) {
                    expandedItems.push(item);
                }
            }

            return expandedItems;
        }

        /**
         * Annotates the item and its internals with
         * the necessary style and accessibility attributes to indicate it is expanded.
         *
         * @private
         * @param {HTMLElement} item The item to annotate as expanded
         */
        function expandItem(item) {
            var index = that._elements["item"].indexOf(item);
            if (index > -1) {
                var button = that._elements["button"][index];
                var panel = that._elements["panel"][index];
                button.classList.add(cssClasses.button.expanded);
                button.setAttribute("aria-expanded", true);
                panel.classList.add(cssClasses.panel.expanded);
                panel.classList.remove(cssClasses.panel.hidden);
                panel.setAttribute("aria-hidden", false);

                if (that._properties.singleExpansion) {
                    button.classList.add(cssClasses.button.disabled);
                    button.setAttribute("aria-disabled", true);
                }
            }
        }

        /**
         * Annotates the item and its internals with
         * the necessary style and accessibility attributes to indicate it is not expanded.
         *
         * @private
         * @param {HTMLElement} item The item to annotate as not expanded
         */
        function collapseItem(item) {
            var index = that._elements["item"].indexOf(item);
            if (index > -1) {
                var button = that._elements["button"][index];
                var panel = that._elements["panel"][index];
                button.classList.remove(cssClasses.button.disabled);
                button.classList.remove(cssClasses.button.expanded);
                button.removeAttribute("aria-disabled");
                button.setAttribute("aria-expanded", false);
                panel.classList.add(cssClasses.panel.hidden);
                panel.classList.remove(cssClasses.panel.expanded);
                panel.setAttribute("aria-hidden", true);
            }
        }

        /**
         * Focuses the button at the provided index.
         *
         * @private
         * @param {Number} index The index of the button to focus
         */
        function focusButton(index) {
            var button = that._elements["button"][index];
            button.focus();
        }
    }

    /**
     * Reads options data from the Accordion wrapper element, defined via {@code data-cmp-*} data attributes.
     *
     * @private
     * @param {HTMLElement} element The Accordion element to read options data from
     * @returns {Object} The options read from the component data attributes
     */
    function readData(element) {
        var data = element.dataset;
        var options = [];
        var capitalized = IS;
        capitalized = capitalized.charAt(0).toUpperCase() + capitalized.slice(1);
        var reserved = ["is", "hook" + capitalized];

        for (var key in data) {
            if (data.hasOwnProperty(key)) {
                var value = data[key];

                if (key.indexOf(NS) === 0) {
                    key = key.slice(NS.length);
                    key = key.charAt(0).toLowerCase() + key.substring(1);

                    if (reserved.indexOf(key) === -1) {
                        options[key] = value;
                    }
                }
            }
        }

        return options;
    }

    /**
     * Document ready handler and DOM mutation observers. Initializes Accordion components as necessary.
     *
     * @private
     */
    function onDocumentReady() {
        var elements = document.querySelectorAll(selectors.self);
        for (var i = 0; i < elements.length; i++) {
            new Accordion({ element: elements[i], options: readData(elements[i]) });
        }

        var MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;
        var body = document.querySelector("body");
        var observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                // needed for IE
                var nodesArray = [].slice.call(mutation.addedNodes);
                if (nodesArray.length > 0) {
                    nodesArray.forEach(function(addedNode) {
                        if (addedNode.querySelectorAll) {
                            var elementsArray = [].slice.call(addedNode.querySelectorAll(selectors.self));
                            elementsArray.forEach(function(element) {
                                new Accordion({ element: element, options: readData(element) });
                            });
                        }
                    });
                }
            });
        });

        observer.observe(body, {
            subtree: true,
            childList: true,
            characterData: true
        });
    }

    if (document.readyState !== "loading") {
        onDocumentReady();
    } else {
        document.addEventListener("DOMContentLoaded", onDocumentReady);
    }
}());

/*******************************************************************************
 * Copyright 2017 Adobe
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ******************************************************************************/
if (window.Element && !Element.prototype.closest) {
    // eslint valid-jsdoc: "off"
    Element.prototype.closest =
        function(s) {
            "use strict";
            var matches = (this.document || this.ownerDocument).querySelectorAll(s);
            var el      = this;
            var i;
            do {
                i = matches.length;
                while (--i >= 0 && matches.item(i) !== el) {
                    // continue
                }
            } while ((i < 0) && (el = el.parentElement));
            return el;
        };
}

if (window.Element && !Element.prototype.matches) {
    Element.prototype.matches =
        Element.prototype.matchesSelector ||
        Element.prototype.mozMatchesSelector ||
        Element.prototype.msMatchesSelector ||
        Element.prototype.oMatchesSelector ||
        Element.prototype.webkitMatchesSelector ||
        function(s) {
            "use strict";
            var matches = (this.document || this.ownerDocument).querySelectorAll(s);
            var i       = matches.length;
            while (--i >= 0 && matches.item(i) !== this) {
                // continue
            }
            return i > -1;
        };
}

if (!Object.assign) {
    Object.assign = function(target, varArgs) { // .length of function is 2
        "use strict";
        if (target === null) {
            throw new TypeError("Cannot convert undefined or null to object");
        }

        var to = Object(target);

        for (var index = 1; index < arguments.length; index++) {
            var nextSource = arguments[index];

            if (nextSource !== null) {
                for (var nextKey in nextSource) {
                    if (Object.prototype.hasOwnProperty.call(nextSource, nextKey)) {
                        to[nextKey] = nextSource[nextKey];
                    }
                }
            }
        }
        return to;
    };
}

(function(arr) {
    "use strict";
    arr.forEach(function(item) {
        if (item.hasOwnProperty("remove")) {
            return;
        }
        Object.defineProperty(item, "remove", {
            configurable: true,
            enumerable: true,
            writable: true,
            value: function remove() {
                this.parentNode.removeChild(this);
            }
        });
    });
})([Element.prototype, CharacterData.prototype, DocumentType.prototype]);

/*******************************************************************************
 * Copyright 2016 Adobe
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 ******************************************************************************/
(function() {
    "use strict";

    var NS = "cmp";
    var IS = "image";

    var EMPTY_PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    var LAZY_THRESHOLD = 0;
    var SRC_URI_TEMPLATE_WIDTH_VAR = "{.width}";

    var selectors = {
        self: "[data-" + NS + '-is="' + IS + '"]',
        image: '[data-cmp-hook-image="image"]',
        map: '[data-cmp-hook-image="map"]',
        area: '[data-cmp-hook-image="area"]'
    };

    var lazyLoader = {
        "cssClass": "cmp-image__image--is-loading",
        "style": {
            "height": 0,
            "padding-bottom": "" // will be replaced with % ratio
        }
    };

    var properties = {
        /**
         * An array of alternative image widths (in pixels).
         * Used to replace a {.width} variable in the src property with an optimal width if a URI template is provided.
         *
         * @memberof Image
         * @type {Number[]}
         * @default []
         */
        "widths": {
            "default": [],
            "transform": function(value) {
                var widths = [];
                value.split(",").forEach(function(item) {
                    item = parseFloat(item);
                    if (!isNaN(item)) {
                        widths.push(item);
                    }
                });
                return widths;
            }
        },
        /**
         * Indicates whether the image should be rendered lazily.
         *
         * @memberof Image
         * @type {Boolean}
         * @default false
         */
        "lazy": {
            "default": false,
            "transform": function(value) {
                return !(value === null || typeof value === "undefined");
            }
        },
        /**
         * The image source.
         *
         * Can be a simple image source, or a URI template representation that
         * can be variable expanded - useful for building an image configuration with an alternative width.
         * e.g. '/path/image.coreimg{.width}.jpeg/1506620954214.jpeg'
         *
         * @memberof Image
         * @type {String}
         */
        "src": {
        }
    };

    var devicePixelRatio = window.devicePixelRatio || 1;

    function readData(element) {
        var data = element.dataset;
        var options = [];
        var capitalized = IS;
        capitalized = capitalized.charAt(0).toUpperCase() + capitalized.slice(1);
        var reserved = ["is", "hook" + capitalized];

        for (var key in data) {
            if (data.hasOwnProperty(key)) {
                var value = data[key];

                if (key.indexOf(NS) === 0) {
                    key = key.slice(NS.length);
                    key = key.charAt(0).toLowerCase() + key.substring(1);

                    if (reserved.indexOf(key) === -1) {
                        options[key] = value;
                    }
                }
            }
        }

        return options;
    }

    function Image(config) {
        var that = this;

        function init(config) {
            // prevents multiple initialization
            config.element.removeAttribute("data-" + NS + "-is");

            setupProperties(config.options);
            cacheElements(config.element);

            if (!that._elements.noscript) {
                return;
            }

            that._elements.container = that._elements.link ? that._elements.link : that._elements.self;

            unwrapNoScript();

            if (that._properties.lazy) {
                addLazyLoader();
            }

            if (that._elements.map) {
                that._elements.image.addEventListener("load", onLoad);
            }

            window.addEventListener("scroll", that.update);
            window.addEventListener("resize", onWindowResize);
            window.addEventListener("update", that.update);
            that._elements.image.addEventListener("cmp-image-redraw", that.update);
            that.update();
        }

        function loadImage() {
            var hasWidths = that._properties.widths && that._properties.widths.length > 0;
            var replacement = hasWidths ? "." + getOptimalWidth() : "";
            var url = that._properties.src.replace(SRC_URI_TEMPLATE_WIDTH_VAR, replacement);

            if (that._elements.image.getAttribute("src") !== url) {
                that._elements.image.setAttribute("src", url);
                if (!hasWidths) {
                    window.removeEventListener("scroll", that.update);
                }
            }

            if (that._lazyLoaderShowing) {
                that._elements.image.addEventListener("load", removeLazyLoader);
            }
        }

        function getOptimalWidth() {
            var container = that._elements.self;
            var containerWidth = container.clientWidth;
            while (containerWidth === 0 && container.parentNode) {
                container = container.parentNode;
                containerWidth = container.clientWidth;
            }
            var optimalWidth = containerWidth * devicePixelRatio;
            var len = that._properties.widths.length;
            var key = 0;

            while ((key < len - 1) && (that._properties.widths[key] < optimalWidth)) {
                key++;
            }

            return that._properties.widths[key].toString();
        }

        function addLazyLoader() {
            var width = that._elements.image.getAttribute("width");
            var height = that._elements.image.getAttribute("height");

            if (width && height) {
                var ratio = (height / width) * 100;
                var styles = lazyLoader.style;

                styles["padding-bottom"] = ratio + "%";

                for (var s in styles) {
                    if (styles.hasOwnProperty(s)) {
                        that._elements.image.style[s] = styles[s];
                    }
                }
            }
            that._elements.image.setAttribute("src", EMPTY_PIXEL);
            that._elements.image.classList.add(lazyLoader.cssClass);
            that._lazyLoaderShowing = true;
        }

        function unwrapNoScript() {
            var markup = decodeNoscript(that._elements.noscript.textContent.trim());
            var parser = new DOMParser();

            // temporary document avoids requesting the image before removing its src
            var temporaryDocument = parser.parseFromString(markup, "text/html");
            var imageElement = temporaryDocument.querySelector(selectors.image);
            imageElement.removeAttribute("src");
            that._elements.container.insertBefore(imageElement, that._elements.noscript);

            var mapElement = temporaryDocument.querySelector(selectors.map);
            if (mapElement) {
                that._elements.container.insertBefore(mapElement, that._elements.noscript);
            }

            that._elements.noscript.parentNode.removeChild(that._elements.noscript);
            if (that._elements.container.matches(selectors.image)) {
                that._elements.image = that._elements.container;
            } else {
                that._elements.image = that._elements.container.querySelector(selectors.image);
            }

            that._elements.map = that._elements.container.querySelector(selectors.map);
            that._elements.areas = that._elements.container.querySelectorAll(selectors.area);
        }

        function removeLazyLoader() {
            that._elements.image.classList.remove(lazyLoader.cssClass);
            for (var property in lazyLoader.style) {
                if (lazyLoader.style.hasOwnProperty(property)) {
                    that._elements.image.style[property] = "";
                }
            }
            that._elements.image.removeEventListener("load", removeLazyLoader);
            that._lazyLoaderShowing = false;
        }

        function isLazyVisible() {
            if (that._elements.container.offsetParent === null) {
                return false;
            }

            var wt = window.pageYOffset;
            var wb = wt + document.documentElement.clientHeight;
            var et = that._elements.container.getBoundingClientRect().top + wt;
            var eb = et + that._elements.container.clientHeight;

            return eb >= wt - LAZY_THRESHOLD && et <= wb + LAZY_THRESHOLD;
        }

        function resizeAreas() {
            if (that._elements.areas && that._elements.areas.length > 0) {
                for (var i = 0; i < that._elements.areas.length; i++) {
                    var width = that._elements.image.width;
                    var height = that._elements.image.height;

                    if (width && height) {
                        var relcoords = that._elements.areas[i].dataset.cmpRelcoords;
                        if (relcoords) {
                            var relativeCoordinates = relcoords.split(",");
                            var coordinates = new Array(relativeCoordinates.length);

                            for (var j = 0; j < coordinates.length; j++) {
                                if (j % 2 === 0) {
                                    coordinates[j] = parseInt(relativeCoordinates[j] * width);
                                } else {
                                    coordinates[j] = parseInt(relativeCoordinates[j] * height);
                                }
                            }

                            that._elements.areas[i].coords = coordinates;
                        }
                    }
                }
            }
        }

        function cacheElements(wrapper) {
            that._elements = {};
            that._elements.self = wrapper;
            var hooks = that._elements.self.querySelectorAll("[data-" + NS + "-hook-" + IS + "]");

            for (var i = 0; i < hooks.length; i++) {
                var hook = hooks[i];
                var capitalized = IS;
                capitalized = capitalized.charAt(0).toUpperCase() + capitalized.slice(1);
                var key = hook.dataset[NS + "Hook" + capitalized];
                that._elements[key] = hook;
            }
        }

        function setupProperties(options) {
            that._properties = {};

            for (var key in properties) {
                if (properties.hasOwnProperty(key)) {
                    var property = properties[key];
                    if (options && options[key] != null) {
                        if (property && typeof property.transform === "function") {
                            that._properties[key] = property.transform(options[key]);
                        } else {
                            that._properties[key] = options[key];
                        }
                    } else {
                        that._properties[key] = properties[key]["default"];
                    }
                }
            }
        }

        function onWindowResize() {
            that.update();
            resizeAreas();
        }

        function onLoad() {
            resizeAreas();
        }

        that.update = function() {
            if (that._properties.lazy) {
                if (isLazyVisible()) {
                    loadImage();
                }
            } else {
                loadImage();
            }
        };

        if (config && config.element) {
            init(config);
        }
    }

    function onDocumentReady() {
        var elements = document.querySelectorAll(selectors.self);
        for (var i = 0; i < elements.length; i++) {
            new Image({ element: elements[i], options: readData(elements[i]) });
        }

        var MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;
        var body             = document.querySelector("body");
        var observer         = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                // needed for IE
                var nodesArray = [].slice.call(mutation.addedNodes);
                if (nodesArray.length > 0) {
                    nodesArray.forEach(function(addedNode) {
                        if (addedNode.querySelectorAll) {
                            var elementsArray = [].slice.call(addedNode.querySelectorAll(selectors.self));
                            elementsArray.forEach(function(element) {
                                new Image({ element: element, options: readData(element) });
                            });
                        }
                    });
                }
            });
        });

        observer.observe(body, {
            subtree: true,
            childList: true,
            characterData: true
        });
    }

    if (document.readyState !== "loading") {
        onDocumentReady();
    } else {
        document.addEventListener("DOMContentLoaded", onDocumentReady);
    }

    /*
        on drag & drop of the component into a parsys, noscript's content will be escaped multiple times by the editor which creates
        the DOM for editing; the HTML parser cannot be used here due to the multiple escaping
     */
    function decodeNoscript(text) {
        text = text.replace(/&(amp;)*lt;/g, "<");
        text = text.replace(/&(amp;)*gt;/g, ">");
        return text;
    }

})();

/**
 * Copyright 2016 Google Inc. All Rights Reserved.
 *
 * Licensed under the W3C SOFTWARE AND DOCUMENT NOTICE AND LICENSE.
 *
 *  https://www.w3.org/Consortium/Legal/2015/copyright-software-and-document
 *
 */
(function() {
'use strict';

// Exit early if we're not running in a browser.
if (typeof window !== 'object') {
  return;
}

// Exit early if all IntersectionObserver and IntersectionObserverEntry
// features are natively supported.
if ('IntersectionObserver' in window &&
    'IntersectionObserverEntry' in window &&
    'intersectionRatio' in window.IntersectionObserverEntry.prototype) {

  // Minimal polyfill for Edge 15's lack of `isIntersecting`
  // See: https://github.com/w3c/IntersectionObserver/issues/211
  if (!('isIntersecting' in window.IntersectionObserverEntry.prototype)) {
    Object.defineProperty(window.IntersectionObserverEntry.prototype,
      'isIntersecting', {
      get: function () {
        return this.intersectionRatio > 0;
      }
    });
  }
  return;
}


/**
 * A local reference to the document.
 */
var document = window.document;


/**
 * An IntersectionObserver registry. This registry exists to hold a strong
 * reference to IntersectionObserver instances currently observing a target
 * element. Without this registry, instances without another reference may be
 * garbage collected.
 */
var registry = [];

/**
 * The signal updater for cross-origin intersection. When not null, it means
 * that the polyfill is configured to work in a cross-origin mode.
 * @type {function(DOMRect|ClientRect, DOMRect|ClientRect)}
 */
var crossOriginUpdater = null;

/**
 * The current cross-origin intersection. Only used in the cross-origin mode.
 * @type {DOMRect|ClientRect}
 */
var crossOriginRect = null;


/**
 * Creates the global IntersectionObserverEntry constructor.
 * https://w3c.github.io/IntersectionObserver/#intersection-observer-entry
 * @param {Object} entry A dictionary of instance properties.
 * @constructor
 */
function IntersectionObserverEntry(entry) {
  this.time = entry.time;
  this.target = entry.target;
  this.rootBounds = ensureDOMRect(entry.rootBounds);
  this.boundingClientRect = ensureDOMRect(entry.boundingClientRect);
  this.intersectionRect = ensureDOMRect(entry.intersectionRect || getEmptyRect());
  this.isIntersecting = !!entry.intersectionRect;

  // Calculates the intersection ratio.
  var targetRect = this.boundingClientRect;
  var targetArea = targetRect.width * targetRect.height;
  var intersectionRect = this.intersectionRect;
  var intersectionArea = intersectionRect.width * intersectionRect.height;

  // Sets intersection ratio.
  if (targetArea) {
    // Round the intersection ratio to avoid floating point math issues:
    // https://github.com/w3c/IntersectionObserver/issues/324
    this.intersectionRatio = Number((intersectionArea / targetArea).toFixed(4));
  } else {
    // If area is zero and is intersecting, sets to 1, otherwise to 0
    this.intersectionRatio = this.isIntersecting ? 1 : 0;
  }
}


/**
 * Creates the global IntersectionObserver constructor.
 * https://w3c.github.io/IntersectionObserver/#intersection-observer-interface
 * @param {Function} callback The function to be invoked after intersection
 *     changes have queued. The function is not invoked if the queue has
 *     been emptied by calling the `takeRecords` method.
 * @param {Object=} opt_options Optional configuration options.
 * @constructor
 */
function IntersectionObserver(callback, opt_options) {

  var options = opt_options || {};

  if (typeof callback != 'function') {
    throw new Error('callback must be a function');
  }

  if (options.root && options.root.nodeType != 1) {
    throw new Error('root must be an Element');
  }

  // Binds and throttles `this._checkForIntersections`.
  this._checkForIntersections = throttle(
      this._checkForIntersections.bind(this), this.THROTTLE_TIMEOUT);

  // Private properties.
  this._callback = callback;
  this._observationTargets = [];
  this._queuedEntries = [];
  this._rootMarginValues = this._parseRootMargin(options.rootMargin);

  // Public properties.
  this.thresholds = this._initThresholds(options.threshold);
  this.root = options.root || null;
  this.rootMargin = this._rootMarginValues.map(function(margin) {
    return margin.value + margin.unit;
  }).join(' ');

  /** @private @const {!Array<!Document>} */
  this._monitoringDocuments = [];
  /** @private @const {!Array<function()>} */
  this._monitoringUnsubscribes = [];
}


/**
 * The minimum interval within which the document will be checked for
 * intersection changes.
 */
IntersectionObserver.prototype.THROTTLE_TIMEOUT = 100;


/**
 * The frequency in which the polyfill polls for intersection changes.
 * this can be updated on a per instance basis and must be set prior to
 * calling `observe` on the first target.
 */
IntersectionObserver.prototype.POLL_INTERVAL = null;

/**
 * Use a mutation observer on the root element
 * to detect intersection changes.
 */
IntersectionObserver.prototype.USE_MUTATION_OBSERVER = true;


/**
 * Sets up the polyfill in the cross-origin mode. The result is the
 * updater function that accepts two arguments: `boundingClientRect` and
 * `intersectionRect` - just as these fields would be available to the
 * parent via `IntersectionObserverEntry`. This function should be called
 * each time the iframe receives intersection information from the parent
 * window, e.g. via messaging.
 * @return {function(DOMRect|ClientRect, DOMRect|ClientRect)}
 */
IntersectionObserver._setupCrossOriginUpdater = function() {
  if (!crossOriginUpdater) {
    /**
     * @param {DOMRect|ClientRect} boundingClientRect
     * @param {DOMRect|ClientRect} intersectionRect
     */
    crossOriginUpdater = function(boundingClientRect, intersectionRect) {
      if (!boundingClientRect || !intersectionRect) {
        crossOriginRect = getEmptyRect();
      } else {
        crossOriginRect = convertFromParentRect(boundingClientRect, intersectionRect);
      }
      registry.forEach(function(observer) {
        observer._checkForIntersections();
      });
    };
  }
  return crossOriginUpdater;
};


/**
 * Resets the cross-origin mode.
 */
IntersectionObserver._resetCrossOriginUpdater = function() {
  crossOriginUpdater = null;
  crossOriginRect = null;
};


/**
 * Starts observing a target element for intersection changes based on
 * the thresholds values.
 * @param {Element} target The DOM element to observe.
 */
IntersectionObserver.prototype.observe = function(target) {
  var isTargetAlreadyObserved = this._observationTargets.some(function(item) {
    return item.element == target;
  });

  if (isTargetAlreadyObserved) {
    return;
  }

  if (!(target && target.nodeType == 1)) {
    throw new Error('target must be an Element');
  }

  this._registerInstance();
  this._observationTargets.push({element: target, entry: null});
  this._monitorIntersections(target.ownerDocument);
  this._checkForIntersections();
};


/**
 * Stops observing a target element for intersection changes.
 * @param {Element} target The DOM element to observe.
 */
IntersectionObserver.prototype.unobserve = function(target) {
  this._observationTargets =
      this._observationTargets.filter(function(item) {
        return item.element != target;
      });
  this._unmonitorIntersections(target.ownerDocument);
  if (this._observationTargets.length == 0) {
    this._unregisterInstance();
  }
};


/**
 * Stops observing all target elements for intersection changes.
 */
IntersectionObserver.prototype.disconnect = function() {
  this._observationTargets = [];
  this._unmonitorAllIntersections();
  this._unregisterInstance();
};


/**
 * Returns any queue entries that have not yet been reported to the
 * callback and clears the queue. This can be used in conjunction with the
 * callback to obtain the absolute most up-to-date intersection information.
 * @return {Array} The currently queued entries.
 */
IntersectionObserver.prototype.takeRecords = function() {
  var records = this._queuedEntries.slice();
  this._queuedEntries = [];
  return records;
};


/**
 * Accepts the threshold value from the user configuration object and
 * returns a sorted array of unique threshold values. If a value is not
 * between 0 and 1 and error is thrown.
 * @private
 * @param {Array|number=} opt_threshold An optional threshold value or
 *     a list of threshold values, defaulting to [0].
 * @return {Array} A sorted list of unique and valid threshold values.
 */
IntersectionObserver.prototype._initThresholds = function(opt_threshold) {
  var threshold = opt_threshold || [0];
  if (!Array.isArray(threshold)) threshold = [threshold];

  return threshold.sort().filter(function(t, i, a) {
    if (typeof t != 'number' || isNaN(t) || t < 0 || t > 1) {
      throw new Error('threshold must be a number between 0 and 1 inclusively');
    }
    return t !== a[i - 1];
  });
};


/**
 * Accepts the rootMargin value from the user configuration object
 * and returns an array of the four margin values as an object containing
 * the value and unit properties. If any of the values are not properly
 * formatted or use a unit other than px or %, and error is thrown.
 * @private
 * @param {string=} opt_rootMargin An optional rootMargin value,
 *     defaulting to '0px'.
 * @return {Array<Object>} An array of margin objects with the keys
 *     value and unit.
 */
IntersectionObserver.prototype._parseRootMargin = function(opt_rootMargin) {
  var marginString = opt_rootMargin || '0px';
  var margins = marginString.split(/\s+/).map(function(margin) {
    var parts = /^(-?\d*\.?\d+)(px|%)$/.exec(margin);
    if (!parts) {
      throw new Error('rootMargin must be specified in pixels or percent');
    }
    return {value: parseFloat(parts[1]), unit: parts[2]};
  });

  // Handles shorthand.
  margins[1] = margins[1] || margins[0];
  margins[2] = margins[2] || margins[0];
  margins[3] = margins[3] || margins[1];

  return margins;
};


/**
 * Starts polling for intersection changes if the polling is not already
 * happening, and if the page's visibility state is visible.
 * @param {!Document} doc
 * @private
 */
IntersectionObserver.prototype._monitorIntersections = function(doc) {
  var win = doc.defaultView;
  if (!win) {
    // Already destroyed.
    return;
  }
  if (this._monitoringDocuments.indexOf(doc) != -1) {
    // Already monitoring.
    return;
  }

  // Private state for monitoring.
  var callback = this._checkForIntersections;
  var monitoringInterval = null;
  var domObserver = null;

  // If a poll interval is set, use polling instead of listening to
  // resize and scroll events or DOM mutations.
  if (this.POLL_INTERVAL) {
    monitoringInterval = win.setInterval(callback, this.POLL_INTERVAL);
  } else {
    addEvent(win, 'resize', callback, true);
    addEvent(doc, 'scroll', callback, true);
    if (this.USE_MUTATION_OBSERVER && 'MutationObserver' in win) {
      domObserver = new win.MutationObserver(callback);
      domObserver.observe(doc, {
        attributes: true,
        childList: true,
        characterData: true,
        subtree: true
      });
    }
  }

  this._monitoringDocuments.push(doc);
  this._monitoringUnsubscribes.push(function() {
    // Get the window object again. When a friendly iframe is destroyed, it
    // will be null.
    var win = doc.defaultView;

    if (win) {
      if (monitoringInterval) {
        win.clearInterval(monitoringInterval);
      }
      removeEvent(win, 'resize', callback, true);
    }

    removeEvent(doc, 'scroll', callback, true);
    if (domObserver) {
      domObserver.disconnect();
    }
  });

  // Also monitor the parent.
  if (doc != (this.root && this.root.ownerDocument || document)) {
    var frame = getFrameElement(doc);
    if (frame) {
      this._monitorIntersections(frame.ownerDocument);
    }
  }
};


/**
 * Stops polling for intersection changes.
 * @param {!Document} doc
 * @private
 */
IntersectionObserver.prototype._unmonitorIntersections = function(doc) {
  var index = this._monitoringDocuments.indexOf(doc);
  if (index == -1) {
    return;
  }

  var rootDoc = (this.root && this.root.ownerDocument || document);

  // Check if any dependent targets are still remaining.
  var hasDependentTargets =
      this._observationTargets.some(function(item) {
        var itemDoc = item.element.ownerDocument;
        // Target is in this context.
        if (itemDoc == doc) {
          return true;
        }
        // Target is nested in this context.
        while (itemDoc && itemDoc != rootDoc) {
          var frame = getFrameElement(itemDoc);
          itemDoc = frame && frame.ownerDocument;
          if (itemDoc == doc) {
            return true;
          }
        }
        return false;
      });
  if (hasDependentTargets) {
    return;
  }

  // Unsubscribe.
  var unsubscribe = this._monitoringUnsubscribes[index];
  this._monitoringDocuments.splice(index, 1);
  this._monitoringUnsubscribes.splice(index, 1);
  unsubscribe();

  // Also unmonitor the parent.
  if (doc != rootDoc) {
    var frame = getFrameElement(doc);
    if (frame) {
      this._unmonitorIntersections(frame.ownerDocument);
    }
  }
};


/**
 * Stops polling for intersection changes.
 * @param {!Document} doc
 * @private
 */
IntersectionObserver.prototype._unmonitorAllIntersections = function() {
  var unsubscribes = this._monitoringUnsubscribes.slice(0);
  this._monitoringDocuments.length = 0;
  this._monitoringUnsubscribes.length = 0;
  for (var i = 0; i < unsubscribes.length; i++) {
    unsubscribes[i]();
  }
};


/**
 * Scans each observation target for intersection changes and adds them
 * to the internal entries queue. If new entries are found, it
 * schedules the callback to be invoked.
 * @private
 */
IntersectionObserver.prototype._checkForIntersections = function() {
  if (!this.root && crossOriginUpdater && !crossOriginRect) {
    // Cross origin monitoring, but no initial data available yet.
    return;
  }

  var rootIsInDom = this._rootIsInDom();
  var rootRect = rootIsInDom ? this._getRootRect() : getEmptyRect();

  this._observationTargets.forEach(function(item) {
    var target = item.element;
    var targetRect = getBoundingClientRect(target);
    var rootContainsTarget = this._rootContainsTarget(target);
    var oldEntry = item.entry;
    var intersectionRect = rootIsInDom && rootContainsTarget &&
        this._computeTargetAndRootIntersection(target, targetRect, rootRect);

    var newEntry = item.entry = new IntersectionObserverEntry({
      time: now(),
      target: target,
      boundingClientRect: targetRect,
      rootBounds: crossOriginUpdater && !this.root ? null : rootRect,
      intersectionRect: intersectionRect
    });

    if (!oldEntry) {
      this._queuedEntries.push(newEntry);
    } else if (rootIsInDom && rootContainsTarget) {
      // If the new entry intersection ratio has crossed any of the
      // thresholds, add a new entry.
      if (this._hasCrossedThreshold(oldEntry, newEntry)) {
        this._queuedEntries.push(newEntry);
      }
    } else {
      // If the root is not in the DOM or target is not contained within
      // root but the previous entry for this target had an intersection,
      // add a new record indicating removal.
      if (oldEntry && oldEntry.isIntersecting) {
        this._queuedEntries.push(newEntry);
      }
    }
  }, this);

  if (this._queuedEntries.length) {
    this._callback(this.takeRecords(), this);
  }
};


/**
 * Accepts a target and root rect computes the intersection between then
 * following the algorithm in the spec.
 * TODO(philipwalton): at this time clip-path is not considered.
 * https://w3c.github.io/IntersectionObserver/#calculate-intersection-rect-algo
 * @param {Element} target The target DOM element
 * @param {Object} targetRect The bounding rect of the target.
 * @param {Object} rootRect The bounding rect of the root after being
 *     expanded by the rootMargin value.
 * @return {?Object} The final intersection rect object or undefined if no
 *     intersection is found.
 * @private
 */
IntersectionObserver.prototype._computeTargetAndRootIntersection =
    function(target, targetRect, rootRect) {
  // If the element isn't displayed, an intersection can't happen.
  if (window.getComputedStyle(target).display == 'none') return;

  var intersectionRect = targetRect;
  var parent = getParentNode(target);
  var atRoot = false;

  while (!atRoot && parent) {
    var parentRect = null;
    var parentComputedStyle = parent.nodeType == 1 ?
        window.getComputedStyle(parent) : {};

    // If the parent isn't displayed, an intersection can't happen.
    if (parentComputedStyle.display == 'none') return null;

    if (parent == this.root || parent.nodeType == /* DOCUMENT */ 9) {
      atRoot = true;
      if (parent == this.root || parent == document) {
        if (crossOriginUpdater && !this.root) {
          if (!crossOriginRect ||
              crossOriginRect.width == 0 && crossOriginRect.height == 0) {
            // A 0-size cross-origin intersection means no-intersection.
            parent = null;
            parentRect = null;
            intersectionRect = null;
          } else {
            parentRect = crossOriginRect;
          }
        } else {
          parentRect = rootRect;
        }
      } else {
        // Check if there's a frame that can be navigated to.
        var frame = getParentNode(parent);
        var frameRect = frame && getBoundingClientRect(frame);
        var frameIntersect =
            frame &&
            this._computeTargetAndRootIntersection(frame, frameRect, rootRect);
        if (frameRect && frameIntersect) {
          parent = frame;
          parentRect = convertFromParentRect(frameRect, frameIntersect);
        } else {
          parent = null;
          intersectionRect = null;
        }
      }
    } else {
      // If the element has a non-visible overflow, and it's not the <body>
      // or <html> element, update the intersection rect.
      // Note: <body> and <html> cannot be clipped to a rect that's not also
      // the document rect, so no need to compute a new intersection.
      var doc = parent.ownerDocument;
      if (parent != doc.body &&
          parent != doc.documentElement &&
          parentComputedStyle.overflow != 'visible') {
        parentRect = getBoundingClientRect(parent);
      }
    }

    // If either of the above conditionals set a new parentRect,
    // calculate new intersection data.
    if (parentRect) {
      intersectionRect = computeRectIntersection(parentRect, intersectionRect);
    }
    if (!intersectionRect) break;
    parent = parent && getParentNode(parent);
  }
  return intersectionRect;
};


/**
 * Returns the root rect after being expanded by the rootMargin value.
 * @return {ClientRect} The expanded root rect.
 * @private
 */
IntersectionObserver.prototype._getRootRect = function() {
  var rootRect;
  if (this.root) {
    rootRect = getBoundingClientRect(this.root);
  } else {
    // Use <html>/<body> instead of window since scroll bars affect size.
    var html = document.documentElement;
    var body = document.body;
    rootRect = {
      top: 0,
      left: 0,
      right: html.clientWidth || body.clientWidth,
      width: html.clientWidth || body.clientWidth,
      bottom: html.clientHeight || body.clientHeight,
      height: html.clientHeight || body.clientHeight
    };
  }
  return this._expandRectByRootMargin(rootRect);
};


/**
 * Accepts a rect and expands it by the rootMargin value.
 * @param {DOMRect|ClientRect} rect The rect object to expand.
 * @return {ClientRect} The expanded rect.
 * @private
 */
IntersectionObserver.prototype._expandRectByRootMargin = function(rect) {
  var margins = this._rootMarginValues.map(function(margin, i) {
    return margin.unit == 'px' ? margin.value :
        margin.value * (i % 2 ? rect.width : rect.height) / 100;
  });
  var newRect = {
    top: rect.top - margins[0],
    right: rect.right + margins[1],
    bottom: rect.bottom + margins[2],
    left: rect.left - margins[3]
  };
  newRect.width = newRect.right - newRect.left;
  newRect.height = newRect.bottom - newRect.top;

  return newRect;
};


/**
 * Accepts an old and new entry and returns true if at least one of the
 * threshold values has been crossed.
 * @param {?IntersectionObserverEntry} oldEntry The previous entry for a
 *    particular target element or null if no previous entry exists.
 * @param {IntersectionObserverEntry} newEntry The current entry for a
 *    particular target element.
 * @return {boolean} Returns true if a any threshold has been crossed.
 * @private
 */
IntersectionObserver.prototype._hasCrossedThreshold =
    function(oldEntry, newEntry) {

  // To make comparing easier, an entry that has a ratio of 0
  // but does not actually intersect is given a value of -1
  var oldRatio = oldEntry && oldEntry.isIntersecting ?
      oldEntry.intersectionRatio || 0 : -1;
  var newRatio = newEntry.isIntersecting ?
      newEntry.intersectionRatio || 0 : -1;

  // Ignore unchanged ratios
  if (oldRatio === newRatio) return;

  for (var i = 0; i < this.thresholds.length; i++) {
    var threshold = this.thresholds[i];

    // Return true if an entry matches a threshold or if the new ratio
    // and the old ratio are on the opposite sides of a threshold.
    if (threshold == oldRatio || threshold == newRatio ||
        threshold < oldRatio !== threshold < newRatio) {
      return true;
    }
  }
};


/**
 * Returns whether or not the root element is an element and is in the DOM.
 * @return {boolean} True if the root element is an element and is in the DOM.
 * @private
 */
IntersectionObserver.prototype._rootIsInDom = function() {
  return !this.root || containsDeep(document, this.root);
};


/**
 * Returns whether or not the target element is a child of root.
 * @param {Element} target The target element to check.
 * @return {boolean} True if the target element is a child of root.
 * @private
 */
IntersectionObserver.prototype._rootContainsTarget = function(target) {
  return containsDeep(this.root || document, target) &&
    (!this.root || this.root.ownerDocument == target.ownerDocument);
};


/**
 * Adds the instance to the global IntersectionObserver registry if it isn't
 * already present.
 * @private
 */
IntersectionObserver.prototype._registerInstance = function() {
  if (registry.indexOf(this) < 0) {
    registry.push(this);
  }
};


/**
 * Removes the instance from the global IntersectionObserver registry.
 * @private
 */
IntersectionObserver.prototype._unregisterInstance = function() {
  var index = registry.indexOf(this);
  if (index != -1) registry.splice(index, 1);
};


/**
 * Returns the result of the performance.now() method or null in browsers
 * that don't support the API.
 * @return {number} The elapsed time since the page was requested.
 */
function now() {
  return window.performance && performance.now && performance.now();
}


/**
 * Throttles a function and delays its execution, so it's only called at most
 * once within a given time period.
 * @param {Function} fn The function to throttle.
 * @param {number} timeout The amount of time that must pass before the
 *     function can be called again.
 * @return {Function} The throttled function.
 */
function throttle(fn, timeout) {
  var timer = null;
  return function () {
    if (!timer) {
      timer = setTimeout(function() {
        fn();
        timer = null;
      }, timeout);
    }
  };
}


/**
 * Adds an event handler to a DOM node ensuring cross-browser compatibility.
 * @param {Node} node The DOM node to add the event handler to.
 * @param {string} event The event name.
 * @param {Function} fn The event handler to add.
 * @param {boolean} opt_useCapture Optionally adds the even to the capture
 *     phase. Note: this only works in modern browsers.
 */
function addEvent(node, event, fn, opt_useCapture) {
  if (typeof node.addEventListener == 'function') {
    node.addEventListener(event, fn, opt_useCapture || false);
  }
  else if (typeof node.attachEvent == 'function') {
    node.attachEvent('on' + event, fn);
  }
}


/**
 * Removes a previously added event handler from a DOM node.
 * @param {Node} node The DOM node to remove the event handler from.
 * @param {string} event The event name.
 * @param {Function} fn The event handler to remove.
 * @param {boolean} opt_useCapture If the event handler was added with this
 *     flag set to true, it should be set to true here in order to remove it.
 */
function removeEvent(node, event, fn, opt_useCapture) {
  if (typeof node.removeEventListener == 'function') {
    node.removeEventListener(event, fn, opt_useCapture || false);
  }
  else if (typeof node.detatchEvent == 'function') {
    node.detatchEvent('on' + event, fn);
  }
}


/**
 * Returns the intersection between two rect objects.
 * @param {Object} rect1 The first rect.
 * @param {Object} rect2 The second rect.
 * @return {?Object|?ClientRect} The intersection rect or undefined if no
 *     intersection is found.
 */
function computeRectIntersection(rect1, rect2) {
  var top = Math.max(rect1.top, rect2.top);
  var bottom = Math.min(rect1.bottom, rect2.bottom);
  var left = Math.max(rect1.left, rect2.left);
  var right = Math.min(rect1.right, rect2.right);
  var width = right - left;
  var height = bottom - top;

  return (width >= 0 && height >= 0) && {
    top: top,
    bottom: bottom,
    left: left,
    right: right,
    width: width,
    height: height
  } || null;
}


/**
 * Shims the native getBoundingClientRect for compatibility with older IE.
 * @param {Element} el The element whose bounding rect to get.
 * @return {DOMRect|ClientRect} The (possibly shimmed) rect of the element.
 */
function getBoundingClientRect(el) {
  var rect;

  try {
    rect = el.getBoundingClientRect();
  } catch (err) {
    // Ignore Windows 7 IE11 "Unspecified error"
    // https://github.com/w3c/IntersectionObserver/pull/205
  }

  if (!rect) return getEmptyRect();

  // Older IE
  if (!(rect.width && rect.height)) {
    rect = {
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      left: rect.left,
      width: rect.right - rect.left,
      height: rect.bottom - rect.top
    };
  }
  return rect;
}


/**
 * Returns an empty rect object. An empty rect is returned when an element
 * is not in the DOM.
 * @return {ClientRect} The empty rect.
 */
function getEmptyRect() {
  return {
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    width: 0,
    height: 0
  };
}


/**
 * Ensure that the result has all of the necessary fields of the DOMRect.
 * Specifically this ensures that `x` and `y` fields are set.
 *
 * @param {?DOMRect|?ClientRect} rect
 * @return {?DOMRect}
 */
function ensureDOMRect(rect) {
  // A `DOMRect` object has `x` and `y` fields.
  if (!rect || 'x' in rect) {
    return rect;
  }
  // A IE's `ClientRect` type does not have `x` and `y`. The same is the case
  // for internally calculated Rect objects. For the purposes of
  // `IntersectionObserver`, it's sufficient to simply mirror `left` and `top`
  // for these fields.
  return {
    top: rect.top,
    y: rect.top,
    bottom: rect.bottom,
    left: rect.left,
    x: rect.left,
    right: rect.right,
    width: rect.width,
    height: rect.height
  };
}


/**
 * Inverts the intersection and bounding rect from the parent (frame) BCR to
 * the local BCR space.
 * @param {DOMRect|ClientRect} parentBoundingRect The parent's bound client rect.
 * @param {DOMRect|ClientRect} parentIntersectionRect The parent's own intersection rect.
 * @return {ClientRect} The local root bounding rect for the parent's children.
 */
function convertFromParentRect(parentBoundingRect, parentIntersectionRect) {
  var top = parentIntersectionRect.top - parentBoundingRect.top;
  var left = parentIntersectionRect.left - parentBoundingRect.left;
  return {
    top: top,
    left: left,
    height: parentIntersectionRect.height,
    width: parentIntersectionRect.width,
    bottom: top + parentIntersectionRect.height,
    right: left + parentIntersectionRect.width
  };
}


/**
 * Checks to see if a parent element contains a child element (including inside
 * shadow DOM).
 * @param {Node} parent The parent element.
 * @param {Node} child The child element.
 * @return {boolean} True if the parent node contains the child node.
 */
function containsDeep(parent, child) {
  var node = child;
  while (node) {
    if (node == parent) return true;

    node = getParentNode(node);
  }
  return false;
}


/**
 * Gets the parent node of an element or its host element if the parent node
 * is a shadow root.
 * @param {Node} node The node whose parent to get.
 * @return {Node|null} The parent node or null if no parent exists.
 */
function getParentNode(node) {
  var parent = node.parentNode;

  if (node.nodeType == /* DOCUMENT */ 9 && node != document) {
    // If this node is a document node, look for the embedding frame.
    return getFrameElement(node);
  }

  if (parent && parent.nodeType == 11 && parent.host) {
    // If the parent is a shadow root, return the host element.
    return parent.host;
  }

  if (parent && parent.assignedSlot) {
    // If the parent is distributed in a <slot>, return the parent of a slot.
    return parent.assignedSlot.parentNode;
  }

  return parent;
}


/**
 * Returns the embedding frame element, if any.
 * @param {!Document} doc
 * @return {!Element}
 */
function getFrameElement(doc) {
  try {
    return doc.defaultView && doc.defaultView.frameElement || null;
  } catch (e) {
    // Ignore the error.
    return null;
  }
}


// Exposes the constructors globally.
window.IntersectionObserver = IntersectionObserver;
window.IntersectionObserverEntry = IntersectionObserverEntry;

}());

var objectFitVideos=function(t){"use strict";function e(t){for(var e=getComputedStyle(t).fontFamily,o=null,i={};null!==(o=l.exec(e));)i[o[1]]=o[2];return i["object-position"]?n(i):i}function o(t){var o=-1;t?"length"in t||(t=[t]):t=document.querySelectorAll("video");for(;t[++o];){var n=e(t[o]);(n["object-fit"]||n["object-position"])&&(n["object-fit"]=n["object-fit"]||"fill",i(t[o],n))}}function i(t,e){function o(){var o=t.videoWidth,n=t.videoHeight,d=o/n,a=r.clientWidth,c=r.clientHeight,p=a/c,l=0,s=0;i.marginLeft=i.marginTop=0,(d<p?"contain"===e["object-fit"]:"cover"===e["object-fit"])?(l=c*d,s=a/d,i.width=Math.round(l)+"px",i.height=c+"px","left"===e["object-position-x"]?i.marginLeft=0:"right"===e["object-position-x"]?i.marginLeft=Math.round(a-l)+"px":i.marginLeft=Math.round((a-l)/2)+"px"):(s=a/d,i.width=a+"px",i.height=Math.round(s)+"px","top"===e["object-position-y"]?i.marginTop=0:"bottom"===e["object-position-y"]?i.marginTop=Math.round(c-s)+"px":i.marginTop=Math.round((c-s)/2)+"px"),t.autoplay&&t.play()}if("fill"!==e["object-fit"]){var i=t.style,n=window.getComputedStyle(t),r=document.createElement("object-fit");r.appendChild(t.parentNode.replaceChild(r,t));var d={height:"100%",width:"100%",boxSizing:"content-box",display:"inline-block",overflow:"hidden"};"backgroundColor backgroundImage borderColor borderStyle borderWidth bottom fontSize lineHeight left opacity margin position right top visibility".replace(/\w+/g,function(t){d[t]=n[t]});for(var a in d)r.style[a]=d[a];i.border=i.margin=i.padding=0,i.display="block",i.opacity=1,t.addEventListener("loadedmetadata",o),window.addEventListener("optimizedResize",o),t.readyState>=1&&(t.removeEventListener("loadedmetadata",o),o())}}function n(t){return~t["object-position"].indexOf("left")?t["object-position-x"]="left":~t["object-position"].indexOf("right")?t["object-position-x"]="right":t["object-position-x"]="center",~t["object-position"].indexOf("top")?t["object-position-y"]="top":~t["object-position"].indexOf("bottom")?t["object-position-y"]="bottom":t["object-position-y"]="center",t}function r(t,e,o){o=o||window;var i=!1,n=null;try{n=new CustomEvent(e)}catch(t){n=document.createEvent("Event"),n.initEvent(e,!0,!0)}var r=function(){i||(i=!0,requestAnimationFrame(function(){o.dispatchEvent(n),i=!1}))};o.addEventListener(t,r)}var d=navigator.userAgent.indexOf("Edge/")>=0,a=new Image,c="object-fit"in a.style&&!d,p="object-position"in a.style&&!d,l=/(object-fit|object-position)\s*:\s*([-\w\s%]+)/g;c&&p||(o(t),r("resize","optimizedResize"))};"undefined"!=typeof module&&"undefined"!=typeof module.exports&&(module.exports=objectFitVideos);
/*! jQuery v3.4.1 | (c) JS Foundation and other contributors | jquery.org/license */
!function(e,t){"use strict";"object"==typeof module&&"object"==typeof module.exports?module.exports=e.document?t(e,!0):function(e){if(!e.document)throw new Error("jQuery requires a window with a document");return t(e)}:t(e)}("undefined"!=typeof window?window:this,function(C,e){"use strict";var t=[],E=C.document,r=Object.getPrototypeOf,s=t.slice,g=t.concat,u=t.push,i=t.indexOf,n={},o=n.toString,v=n.hasOwnProperty,a=v.toString,l=a.call(Object),y={},m=function(e){return"function"==typeof e&&"number"!=typeof e.nodeType},x=function(e){return null!=e&&e===e.window},c={type:!0,src:!0,nonce:!0,noModule:!0};function b(e,t,n){var r,i,o=(n=n||E).createElement("script");if(o.text=e,t)for(r in c)(i=t[r]||t.getAttribute&&t.getAttribute(r))&&o.setAttribute(r,i);n.head.appendChild(o).parentNode.removeChild(o)}function w(e){return null==e?e+"":"object"==typeof e||"function"==typeof e?n[o.call(e)]||"object":typeof e}var f="3.4.1",k=function(e,t){return new k.fn.init(e,t)},p=/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g;function d(e){var t=!!e&&"length"in e&&e.length,n=w(e);return!m(e)&&!x(e)&&("array"===n||0===t||"number"==typeof t&&0<t&&t-1 in e)}k.fn=k.prototype={jquery:f,constructor:k,length:0,toArray:function(){return s.call(this)},get:function(e){return null==e?s.call(this):e<0?this[e+this.length]:this[e]},pushStack:function(e){var t=k.merge(this.constructor(),e);return t.prevObject=this,t},each:function(e){return k.each(this,e)},map:function(n){return this.pushStack(k.map(this,function(e,t){return n.call(e,t,e)}))},slice:function(){return this.pushStack(s.apply(this,arguments))},first:function(){return this.eq(0)},last:function(){return this.eq(-1)},eq:function(e){var t=this.length,n=+e+(e<0?t:0);return this.pushStack(0<=n&&n<t?[this[n]]:[])},end:function(){return this.prevObject||this.constructor()},push:u,sort:t.sort,splice:t.splice},k.extend=k.fn.extend=function(){var e,t,n,r,i,o,a=arguments[0]||{},s=1,u=arguments.length,l=!1;for("boolean"==typeof a&&(l=a,a=arguments[s]||{},s++),"object"==typeof a||m(a)||(a={}),s===u&&(a=this,s--);s<u;s++)if(null!=(e=arguments[s]))for(t in e)r=e[t],"__proto__"!==t&&a!==r&&(l&&r&&(k.isPlainObject(r)||(i=Array.isArray(r)))?(n=a[t],o=i&&!Array.isArray(n)?[]:i||k.isPlainObject(n)?n:{},i=!1,a[t]=k.extend(l,o,r)):void 0!==r&&(a[t]=r));return a},k.extend({expando:"jQuery"+(f+Math.random()).replace(/\D/g,""),isReady:!0,error:function(e){throw new Error(e)},noop:function(){},isPlainObject:function(e){var t,n;return!(!e||"[object Object]"!==o.call(e))&&(!(t=r(e))||"function"==typeof(n=v.call(t,"constructor")&&t.constructor)&&a.call(n)===l)},isEmptyObject:function(e){var t;for(t in e)return!1;return!0},globalEval:function(e,t){b(e,{nonce:t&&t.nonce})},each:function(e,t){var n,r=0;if(d(e)){for(n=e.length;r<n;r++)if(!1===t.call(e[r],r,e[r]))break}else for(r in e)if(!1===t.call(e[r],r,e[r]))break;return e},trim:function(e){return null==e?"":(e+"").replace(p,"")},makeArray:function(e,t){var n=t||[];return null!=e&&(d(Object(e))?k.merge(n,"string"==typeof e?[e]:e):u.call(n,e)),n},inArray:function(e,t,n){return null==t?-1:i.call(t,e,n)},merge:function(e,t){for(var n=+t.length,r=0,i=e.length;r<n;r++)e[i++]=t[r];return e.length=i,e},grep:function(e,t,n){for(var r=[],i=0,o=e.length,a=!n;i<o;i++)!t(e[i],i)!==a&&r.push(e[i]);return r},map:function(e,t,n){var r,i,o=0,a=[];if(d(e))for(r=e.length;o<r;o++)null!=(i=t(e[o],o,n))&&a.push(i);else for(o in e)null!=(i=t(e[o],o,n))&&a.push(i);return g.apply([],a)},guid:1,support:y}),"function"==typeof Symbol&&(k.fn[Symbol.iterator]=t[Symbol.iterator]),k.each("Boolean Number String Function Array Date RegExp Object Error Symbol".split(" "),function(e,t){n["[object "+t+"]"]=t.toLowerCase()});var h=function(n){var e,d,b,o,i,h,f,g,w,u,l,T,C,a,E,v,s,c,y,k="sizzle"+1*new Date,m=n.document,S=0,r=0,p=ue(),x=ue(),N=ue(),A=ue(),D=function(e,t){return e===t&&(l=!0),0},j={}.hasOwnProperty,t=[],q=t.pop,L=t.push,H=t.push,O=t.slice,P=function(e,t){for(var n=0,r=e.length;n<r;n++)if(e[n]===t)return n;return-1},R="checked|selected|async|autofocus|autoplay|controls|defer|disabled|hidden|ismap|loop|multiple|open|readonly|required|scoped",M="[\\x20\\t\\r\\n\\f]",I="(?:\\\\.|[\\w-]|[^\0-\\xa0])+",W="\\["+M+"*("+I+")(?:"+M+"*([*^$|!~]?=)"+M+"*(?:'((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\"|("+I+"))|)"+M+"*\\]",$=":("+I+")(?:\\((('((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\")|((?:\\\\.|[^\\\\()[\\]]|"+W+")*)|.*)\\)|)",F=new RegExp(M+"+","g"),B=new RegExp("^"+M+"+|((?:^|[^\\\\])(?:\\\\.)*)"+M+"+$","g"),_=new RegExp("^"+M+"*,"+M+"*"),z=new RegExp("^"+M+"*([>+~]|"+M+")"+M+"*"),U=new RegExp(M+"|>"),X=new RegExp($),V=new RegExp("^"+I+"$"),G={ID:new RegExp("^#("+I+")"),CLASS:new RegExp("^\\.("+I+")"),TAG:new RegExp("^("+I+"|[*])"),ATTR:new RegExp("^"+W),PSEUDO:new RegExp("^"+$),CHILD:new RegExp("^:(only|first|last|nth|nth-last)-(child|of-type)(?:\\("+M+"*(even|odd|(([+-]|)(\\d*)n|)"+M+"*(?:([+-]|)"+M+"*(\\d+)|))"+M+"*\\)|)","i"),bool:new RegExp("^(?:"+R+")$","i"),needsContext:new RegExp("^"+M+"*[>+~]|:(even|odd|eq|gt|lt|nth|first|last)(?:\\("+M+"*((?:-\\d)?\\d*)"+M+"*\\)|)(?=[^-]|$)","i")},Y=/HTML$/i,Q=/^(?:input|select|textarea|button)$/i,J=/^h\d$/i,K=/^[^{]+\{\s*\[native \w/,Z=/^(?:#([\w-]+)|(\w+)|\.([\w-]+))$/,ee=/[+~]/,te=new RegExp("\\\\([\\da-f]{1,6}"+M+"?|("+M+")|.)","ig"),ne=function(e,t,n){var r="0x"+t-65536;return r!=r||n?t:r<0?String.fromCharCode(r+65536):String.fromCharCode(r>>10|55296,1023&r|56320)},re=/([\0-\x1f\x7f]|^-?\d)|^-$|[^\0-\x1f\x7f-\uFFFF\w-]/g,ie=function(e,t){return t?"\0"===e?"\ufffd":e.slice(0,-1)+"\\"+e.charCodeAt(e.length-1).toString(16)+" ":"\\"+e},oe=function(){T()},ae=be(function(e){return!0===e.disabled&&"fieldset"===e.nodeName.toLowerCase()},{dir:"parentNode",next:"legend"});try{H.apply(t=O.call(m.childNodes),m.childNodes),t[m.childNodes.length].nodeType}catch(e){H={apply:t.length?function(e,t){L.apply(e,O.call(t))}:function(e,t){var n=e.length,r=0;while(e[n++]=t[r++]);e.length=n-1}}}function se(t,e,n,r){var i,o,a,s,u,l,c,f=e&&e.ownerDocument,p=e?e.nodeType:9;if(n=n||[],"string"!=typeof t||!t||1!==p&&9!==p&&11!==p)return n;if(!r&&((e?e.ownerDocument||e:m)!==C&&T(e),e=e||C,E)){if(11!==p&&(u=Z.exec(t)))if(i=u[1]){if(9===p){if(!(a=e.getElementById(i)))return n;if(a.id===i)return n.push(a),n}else if(f&&(a=f.getElementById(i))&&y(e,a)&&a.id===i)return n.push(a),n}else{if(u[2])return H.apply(n,e.getElementsByTagName(t)),n;if((i=u[3])&&d.getElementsByClassName&&e.getElementsByClassName)return H.apply(n,e.getElementsByClassName(i)),n}if(d.qsa&&!A[t+" "]&&(!v||!v.test(t))&&(1!==p||"object"!==e.nodeName.toLowerCase())){if(c=t,f=e,1===p&&U.test(t)){(s=e.getAttribute("id"))?s=s.replace(re,ie):e.setAttribute("id",s=k),o=(l=h(t)).length;while(o--)l[o]="#"+s+" "+xe(l[o]);c=l.join(","),f=ee.test(t)&&ye(e.parentNode)||e}try{return H.apply(n,f.querySelectorAll(c)),n}catch(e){A(t,!0)}finally{s===k&&e.removeAttribute("id")}}}return g(t.replace(B,"$1"),e,n,r)}function ue(){var r=[];return function e(t,n){return r.push(t+" ")>b.cacheLength&&delete e[r.shift()],e[t+" "]=n}}function le(e){return e[k]=!0,e}function ce(e){var t=C.createElement("fieldset");try{return!!e(t)}catch(e){return!1}finally{t.parentNode&&t.parentNode.removeChild(t),t=null}}function fe(e,t){var n=e.split("|"),r=n.length;while(r--)b.attrHandle[n[r]]=t}function pe(e,t){var n=t&&e,r=n&&1===e.nodeType&&1===t.nodeType&&e.sourceIndex-t.sourceIndex;if(r)return r;if(n)while(n=n.nextSibling)if(n===t)return-1;return e?1:-1}function de(t){return function(e){return"input"===e.nodeName.toLowerCase()&&e.type===t}}function he(n){return function(e){var t=e.nodeName.toLowerCase();return("input"===t||"button"===t)&&e.type===n}}function ge(t){return function(e){return"form"in e?e.parentNode&&!1===e.disabled?"label"in e?"label"in e.parentNode?e.parentNode.disabled===t:e.disabled===t:e.isDisabled===t||e.isDisabled!==!t&&ae(e)===t:e.disabled===t:"label"in e&&e.disabled===t}}function ve(a){return le(function(o){return o=+o,le(function(e,t){var n,r=a([],e.length,o),i=r.length;while(i--)e[n=r[i]]&&(e[n]=!(t[n]=e[n]))})})}function ye(e){return e&&"undefined"!=typeof e.getElementsByTagName&&e}for(e in d=se.support={},i=se.isXML=function(e){var t=e.namespaceURI,n=(e.ownerDocument||e).documentElement;return!Y.test(t||n&&n.nodeName||"HTML")},T=se.setDocument=function(e){var t,n,r=e?e.ownerDocument||e:m;return r!==C&&9===r.nodeType&&r.documentElement&&(a=(C=r).documentElement,E=!i(C),m!==C&&(n=C.defaultView)&&n.top!==n&&(n.addEventListener?n.addEventListener("unload",oe,!1):n.attachEvent&&n.attachEvent("onunload",oe)),d.attributes=ce(function(e){return e.className="i",!e.getAttribute("className")}),d.getElementsByTagName=ce(function(e){return e.appendChild(C.createComment("")),!e.getElementsByTagName("*").length}),d.getElementsByClassName=K.test(C.getElementsByClassName),d.getById=ce(function(e){return a.appendChild(e).id=k,!C.getElementsByName||!C.getElementsByName(k).length}),d.getById?(b.filter.ID=function(e){var t=e.replace(te,ne);return function(e){return e.getAttribute("id")===t}},b.find.ID=function(e,t){if("undefined"!=typeof t.getElementById&&E){var n=t.getElementById(e);return n?[n]:[]}}):(b.filter.ID=function(e){var n=e.replace(te,ne);return function(e){var t="undefined"!=typeof e.getAttributeNode&&e.getAttributeNode("id");return t&&t.value===n}},b.find.ID=function(e,t){if("undefined"!=typeof t.getElementById&&E){var n,r,i,o=t.getElementById(e);if(o){if((n=o.getAttributeNode("id"))&&n.value===e)return[o];i=t.getElementsByName(e),r=0;while(o=i[r++])if((n=o.getAttributeNode("id"))&&n.value===e)return[o]}return[]}}),b.find.TAG=d.getElementsByTagName?function(e,t){return"undefined"!=typeof t.getElementsByTagName?t.getElementsByTagName(e):d.qsa?t.querySelectorAll(e):void 0}:function(e,t){var n,r=[],i=0,o=t.getElementsByTagName(e);if("*"===e){while(n=o[i++])1===n.nodeType&&r.push(n);return r}return o},b.find.CLASS=d.getElementsByClassName&&function(e,t){if("undefined"!=typeof t.getElementsByClassName&&E)return t.getElementsByClassName(e)},s=[],v=[],(d.qsa=K.test(C.querySelectorAll))&&(ce(function(e){a.appendChild(e).innerHTML="<a id='"+k+"'></a><select id='"+k+"-\r\\' msallowcapture=''><option selected=''></option></select>",e.querySelectorAll("[msallowcapture^='']").length&&v.push("[*^$]="+M+"*(?:''|\"\")"),e.querySelectorAll("[selected]").length||v.push("\\["+M+"*(?:value|"+R+")"),e.querySelectorAll("[id~="+k+"-]").length||v.push("~="),e.querySelectorAll(":checked").length||v.push(":checked"),e.querySelectorAll("a#"+k+"+*").length||v.push(".#.+[+~]")}),ce(function(e){e.innerHTML="<a href='' disabled='disabled'></a><select disabled='disabled'><option/></select>";var t=C.createElement("input");t.setAttribute("type","hidden"),e.appendChild(t).setAttribute("name","D"),e.querySelectorAll("[name=d]").length&&v.push("name"+M+"*[*^$|!~]?="),2!==e.querySelectorAll(":enabled").length&&v.push(":enabled",":disabled"),a.appendChild(e).disabled=!0,2!==e.querySelectorAll(":disabled").length&&v.push(":enabled",":disabled"),e.querySelectorAll("*,:x"),v.push(",.*:")})),(d.matchesSelector=K.test(c=a.matches||a.webkitMatchesSelector||a.mozMatchesSelector||a.oMatchesSelector||a.msMatchesSelector))&&ce(function(e){d.disconnectedMatch=c.call(e,"*"),c.call(e,"[s!='']:x"),s.push("!=",$)}),v=v.length&&new RegExp(v.join("|")),s=s.length&&new RegExp(s.join("|")),t=K.test(a.compareDocumentPosition),y=t||K.test(a.contains)?function(e,t){var n=9===e.nodeType?e.documentElement:e,r=t&&t.parentNode;return e===r||!(!r||1!==r.nodeType||!(n.contains?n.contains(r):e.compareDocumentPosition&&16&e.compareDocumentPosition(r)))}:function(e,t){if(t)while(t=t.parentNode)if(t===e)return!0;return!1},D=t?function(e,t){if(e===t)return l=!0,0;var n=!e.compareDocumentPosition-!t.compareDocumentPosition;return n||(1&(n=(e.ownerDocument||e)===(t.ownerDocument||t)?e.compareDocumentPosition(t):1)||!d.sortDetached&&t.compareDocumentPosition(e)===n?e===C||e.ownerDocument===m&&y(m,e)?-1:t===C||t.ownerDocument===m&&y(m,t)?1:u?P(u,e)-P(u,t):0:4&n?-1:1)}:function(e,t){if(e===t)return l=!0,0;var n,r=0,i=e.parentNode,o=t.parentNode,a=[e],s=[t];if(!i||!o)return e===C?-1:t===C?1:i?-1:o?1:u?P(u,e)-P(u,t):0;if(i===o)return pe(e,t);n=e;while(n=n.parentNode)a.unshift(n);n=t;while(n=n.parentNode)s.unshift(n);while(a[r]===s[r])r++;return r?pe(a[r],s[r]):a[r]===m?-1:s[r]===m?1:0}),C},se.matches=function(e,t){return se(e,null,null,t)},se.matchesSelector=function(e,t){if((e.ownerDocument||e)!==C&&T(e),d.matchesSelector&&E&&!A[t+" "]&&(!s||!s.test(t))&&(!v||!v.test(t)))try{var n=c.call(e,t);if(n||d.disconnectedMatch||e.document&&11!==e.document.nodeType)return n}catch(e){A(t,!0)}return 0<se(t,C,null,[e]).length},se.contains=function(e,t){return(e.ownerDocument||e)!==C&&T(e),y(e,t)},se.attr=function(e,t){(e.ownerDocument||e)!==C&&T(e);var n=b.attrHandle[t.toLowerCase()],r=n&&j.call(b.attrHandle,t.toLowerCase())?n(e,t,!E):void 0;return void 0!==r?r:d.attributes||!E?e.getAttribute(t):(r=e.getAttributeNode(t))&&r.specified?r.value:null},se.escape=function(e){return(e+"").replace(re,ie)},se.error=function(e){throw new Error("Syntax error, unrecognized expression: "+e)},se.uniqueSort=function(e){var t,n=[],r=0,i=0;if(l=!d.detectDuplicates,u=!d.sortStable&&e.slice(0),e.sort(D),l){while(t=e[i++])t===e[i]&&(r=n.push(i));while(r--)e.splice(n[r],1)}return u=null,e},o=se.getText=function(e){var t,n="",r=0,i=e.nodeType;if(i){if(1===i||9===i||11===i){if("string"==typeof e.textContent)return e.textContent;for(e=e.firstChild;e;e=e.nextSibling)n+=o(e)}else if(3===i||4===i)return e.nodeValue}else while(t=e[r++])n+=o(t);return n},(b=se.selectors={cacheLength:50,createPseudo:le,match:G,attrHandle:{},find:{},relative:{">":{dir:"parentNode",first:!0}," ":{dir:"parentNode"},"+":{dir:"previousSibling",first:!0},"~":{dir:"previousSibling"}},preFilter:{ATTR:function(e){return e[1]=e[1].replace(te,ne),e[3]=(e[3]||e[4]||e[5]||"").replace(te,ne),"~="===e[2]&&(e[3]=" "+e[3]+" "),e.slice(0,4)},CHILD:function(e){return e[1]=e[1].toLowerCase(),"nth"===e[1].slice(0,3)?(e[3]||se.error(e[0]),e[4]=+(e[4]?e[5]+(e[6]||1):2*("even"===e[3]||"odd"===e[3])),e[5]=+(e[7]+e[8]||"odd"===e[3])):e[3]&&se.error(e[0]),e},PSEUDO:function(e){var t,n=!e[6]&&e[2];return G.CHILD.test(e[0])?null:(e[3]?e[2]=e[4]||e[5]||"":n&&X.test(n)&&(t=h(n,!0))&&(t=n.indexOf(")",n.length-t)-n.length)&&(e[0]=e[0].slice(0,t),e[2]=n.slice(0,t)),e.slice(0,3))}},filter:{TAG:function(e){var t=e.replace(te,ne).toLowerCase();return"*"===e?function(){return!0}:function(e){return e.nodeName&&e.nodeName.toLowerCase()===t}},CLASS:function(e){var t=p[e+" "];return t||(t=new RegExp("(^|"+M+")"+e+"("+M+"|$)"))&&p(e,function(e){return t.test("string"==typeof e.className&&e.className||"undefined"!=typeof e.getAttribute&&e.getAttribute("class")||"")})},ATTR:function(n,r,i){return function(e){var t=se.attr(e,n);return null==t?"!="===r:!r||(t+="","="===r?t===i:"!="===r?t!==i:"^="===r?i&&0===t.indexOf(i):"*="===r?i&&-1<t.indexOf(i):"$="===r?i&&t.slice(-i.length)===i:"~="===r?-1<(" "+t.replace(F," ")+" ").indexOf(i):"|="===r&&(t===i||t.slice(0,i.length+1)===i+"-"))}},CHILD:function(h,e,t,g,v){var y="nth"!==h.slice(0,3),m="last"!==h.slice(-4),x="of-type"===e;return 1===g&&0===v?function(e){return!!e.parentNode}:function(e,t,n){var r,i,o,a,s,u,l=y!==m?"nextSibling":"previousSibling",c=e.parentNode,f=x&&e.nodeName.toLowerCase(),p=!n&&!x,d=!1;if(c){if(y){while(l){a=e;while(a=a[l])if(x?a.nodeName.toLowerCase()===f:1===a.nodeType)return!1;u=l="only"===h&&!u&&"nextSibling"}return!0}if(u=[m?c.firstChild:c.lastChild],m&&p){d=(s=(r=(i=(o=(a=c)[k]||(a[k]={}))[a.uniqueID]||(o[a.uniqueID]={}))[h]||[])[0]===S&&r[1])&&r[2],a=s&&c.childNodes[s];while(a=++s&&a&&a[l]||(d=s=0)||u.pop())if(1===a.nodeType&&++d&&a===e){i[h]=[S,s,d];break}}else if(p&&(d=s=(r=(i=(o=(a=e)[k]||(a[k]={}))[a.uniqueID]||(o[a.uniqueID]={}))[h]||[])[0]===S&&r[1]),!1===d)while(a=++s&&a&&a[l]||(d=s=0)||u.pop())if((x?a.nodeName.toLowerCase()===f:1===a.nodeType)&&++d&&(p&&((i=(o=a[k]||(a[k]={}))[a.uniqueID]||(o[a.uniqueID]={}))[h]=[S,d]),a===e))break;return(d-=v)===g||d%g==0&&0<=d/g}}},PSEUDO:function(e,o){var t,a=b.pseudos[e]||b.setFilters[e.toLowerCase()]||se.error("unsupported pseudo: "+e);return a[k]?a(o):1<a.length?(t=[e,e,"",o],b.setFilters.hasOwnProperty(e.toLowerCase())?le(function(e,t){var n,r=a(e,o),i=r.length;while(i--)e[n=P(e,r[i])]=!(t[n]=r[i])}):function(e){return a(e,0,t)}):a}},pseudos:{not:le(function(e){var r=[],i=[],s=f(e.replace(B,"$1"));return s[k]?le(function(e,t,n,r){var i,o=s(e,null,r,[]),a=e.length;while(a--)(i=o[a])&&(e[a]=!(t[a]=i))}):function(e,t,n){return r[0]=e,s(r,null,n,i),r[0]=null,!i.pop()}}),has:le(function(t){return function(e){return 0<se(t,e).length}}),contains:le(function(t){return t=t.replace(te,ne),function(e){return-1<(e.textContent||o(e)).indexOf(t)}}),lang:le(function(n){return V.test(n||"")||se.error("unsupported lang: "+n),n=n.replace(te,ne).toLowerCase(),function(e){var t;do{if(t=E?e.lang:e.getAttribute("xml:lang")||e.getAttribute("lang"))return(t=t.toLowerCase())===n||0===t.indexOf(n+"-")}while((e=e.parentNode)&&1===e.nodeType);return!1}}),target:function(e){var t=n.location&&n.location.hash;return t&&t.slice(1)===e.id},root:function(e){return e===a},focus:function(e){return e===C.activeElement&&(!C.hasFocus||C.hasFocus())&&!!(e.type||e.href||~e.tabIndex)},enabled:ge(!1),disabled:ge(!0),checked:function(e){var t=e.nodeName.toLowerCase();return"input"===t&&!!e.checked||"option"===t&&!!e.selected},selected:function(e){return e.parentNode&&e.parentNode.selectedIndex,!0===e.selected},empty:function(e){for(e=e.firstChild;e;e=e.nextSibling)if(e.nodeType<6)return!1;return!0},parent:function(e){return!b.pseudos.empty(e)},header:function(e){return J.test(e.nodeName)},input:function(e){return Q.test(e.nodeName)},button:function(e){var t=e.nodeName.toLowerCase();return"input"===t&&"button"===e.type||"button"===t},text:function(e){var t;return"input"===e.nodeName.toLowerCase()&&"text"===e.type&&(null==(t=e.getAttribute("type"))||"text"===t.toLowerCase())},first:ve(function(){return[0]}),last:ve(function(e,t){return[t-1]}),eq:ve(function(e,t,n){return[n<0?n+t:n]}),even:ve(function(e,t){for(var n=0;n<t;n+=2)e.push(n);return e}),odd:ve(function(e,t){for(var n=1;n<t;n+=2)e.push(n);return e}),lt:ve(function(e,t,n){for(var r=n<0?n+t:t<n?t:n;0<=--r;)e.push(r);return e}),gt:ve(function(e,t,n){for(var r=n<0?n+t:n;++r<t;)e.push(r);return e})}}).pseudos.nth=b.pseudos.eq,{radio:!0,checkbox:!0,file:!0,password:!0,image:!0})b.pseudos[e]=de(e);for(e in{submit:!0,reset:!0})b.pseudos[e]=he(e);function me(){}function xe(e){for(var t=0,n=e.length,r="";t<n;t++)r+=e[t].value;return r}function be(s,e,t){var u=e.dir,l=e.next,c=l||u,f=t&&"parentNode"===c,p=r++;return e.first?function(e,t,n){while(e=e[u])if(1===e.nodeType||f)return s(e,t,n);return!1}:function(e,t,n){var r,i,o,a=[S,p];if(n){while(e=e[u])if((1===e.nodeType||f)&&s(e,t,n))return!0}else while(e=e[u])if(1===e.nodeType||f)if(i=(o=e[k]||(e[k]={}))[e.uniqueID]||(o[e.uniqueID]={}),l&&l===e.nodeName.toLowerCase())e=e[u]||e;else{if((r=i[c])&&r[0]===S&&r[1]===p)return a[2]=r[2];if((i[c]=a)[2]=s(e,t,n))return!0}return!1}}function we(i){return 1<i.length?function(e,t,n){var r=i.length;while(r--)if(!i[r](e,t,n))return!1;return!0}:i[0]}function Te(e,t,n,r,i){for(var o,a=[],s=0,u=e.length,l=null!=t;s<u;s++)(o=e[s])&&(n&&!n(o,r,i)||(a.push(o),l&&t.push(s)));return a}function Ce(d,h,g,v,y,e){return v&&!v[k]&&(v=Ce(v)),y&&!y[k]&&(y=Ce(y,e)),le(function(e,t,n,r){var i,o,a,s=[],u=[],l=t.length,c=e||function(e,t,n){for(var r=0,i=t.length;r<i;r++)se(e,t[r],n);return n}(h||"*",n.nodeType?[n]:n,[]),f=!d||!e&&h?c:Te(c,s,d,n,r),p=g?y||(e?d:l||v)?[]:t:f;if(g&&g(f,p,n,r),v){i=Te(p,u),v(i,[],n,r),o=i.length;while(o--)(a=i[o])&&(p[u[o]]=!(f[u[o]]=a))}if(e){if(y||d){if(y){i=[],o=p.length;while(o--)(a=p[o])&&i.push(f[o]=a);y(null,p=[],i,r)}o=p.length;while(o--)(a=p[o])&&-1<(i=y?P(e,a):s[o])&&(e[i]=!(t[i]=a))}}else p=Te(p===t?p.splice(l,p.length):p),y?y(null,t,p,r):H.apply(t,p)})}function Ee(e){for(var i,t,n,r=e.length,o=b.relative[e[0].type],a=o||b.relative[" "],s=o?1:0,u=be(function(e){return e===i},a,!0),l=be(function(e){return-1<P(i,e)},a,!0),c=[function(e,t,n){var r=!o&&(n||t!==w)||((i=t).nodeType?u(e,t,n):l(e,t,n));return i=null,r}];s<r;s++)if(t=b.relative[e[s].type])c=[be(we(c),t)];else{if((t=b.filter[e[s].type].apply(null,e[s].matches))[k]){for(n=++s;n<r;n++)if(b.relative[e[n].type])break;return Ce(1<s&&we(c),1<s&&xe(e.slice(0,s-1).concat({value:" "===e[s-2].type?"*":""})).replace(B,"$1"),t,s<n&&Ee(e.slice(s,n)),n<r&&Ee(e=e.slice(n)),n<r&&xe(e))}c.push(t)}return we(c)}return me.prototype=b.filters=b.pseudos,b.setFilters=new me,h=se.tokenize=function(e,t){var n,r,i,o,a,s,u,l=x[e+" "];if(l)return t?0:l.slice(0);a=e,s=[],u=b.preFilter;while(a){for(o in n&&!(r=_.exec(a))||(r&&(a=a.slice(r[0].length)||a),s.push(i=[])),n=!1,(r=z.exec(a))&&(n=r.shift(),i.push({value:n,type:r[0].replace(B," ")}),a=a.slice(n.length)),b.filter)!(r=G[o].exec(a))||u[o]&&!(r=u[o](r))||(n=r.shift(),i.push({value:n,type:o,matches:r}),a=a.slice(n.length));if(!n)break}return t?a.length:a?se.error(e):x(e,s).slice(0)},f=se.compile=function(e,t){var n,v,y,m,x,r,i=[],o=[],a=N[e+" "];if(!a){t||(t=h(e)),n=t.length;while(n--)(a=Ee(t[n]))[k]?i.push(a):o.push(a);(a=N(e,(v=o,m=0<(y=i).length,x=0<v.length,r=function(e,t,n,r,i){var o,a,s,u=0,l="0",c=e&&[],f=[],p=w,d=e||x&&b.find.TAG("*",i),h=S+=null==p?1:Math.random()||.1,g=d.length;for(i&&(w=t===C||t||i);l!==g&&null!=(o=d[l]);l++){if(x&&o){a=0,t||o.ownerDocument===C||(T(o),n=!E);while(s=v[a++])if(s(o,t||C,n)){r.push(o);break}i&&(S=h)}m&&((o=!s&&o)&&u--,e&&c.push(o))}if(u+=l,m&&l!==u){a=0;while(s=y[a++])s(c,f,t,n);if(e){if(0<u)while(l--)c[l]||f[l]||(f[l]=q.call(r));f=Te(f)}H.apply(r,f),i&&!e&&0<f.length&&1<u+y.length&&se.uniqueSort(r)}return i&&(S=h,w=p),c},m?le(r):r))).selector=e}return a},g=se.select=function(e,t,n,r){var i,o,a,s,u,l="function"==typeof e&&e,c=!r&&h(e=l.selector||e);if(n=n||[],1===c.length){if(2<(o=c[0]=c[0].slice(0)).length&&"ID"===(a=o[0]).type&&9===t.nodeType&&E&&b.relative[o[1].type]){if(!(t=(b.find.ID(a.matches[0].replace(te,ne),t)||[])[0]))return n;l&&(t=t.parentNode),e=e.slice(o.shift().value.length)}i=G.needsContext.test(e)?0:o.length;while(i--){if(a=o[i],b.relative[s=a.type])break;if((u=b.find[s])&&(r=u(a.matches[0].replace(te,ne),ee.test(o[0].type)&&ye(t.parentNode)||t))){if(o.splice(i,1),!(e=r.length&&xe(o)))return H.apply(n,r),n;break}}}return(l||f(e,c))(r,t,!E,n,!t||ee.test(e)&&ye(t.parentNode)||t),n},d.sortStable=k.split("").sort(D).join("")===k,d.detectDuplicates=!!l,T(),d.sortDetached=ce(function(e){return 1&e.compareDocumentPosition(C.createElement("fieldset"))}),ce(function(e){return e.innerHTML="<a href='#'></a>","#"===e.firstChild.getAttribute("href")})||fe("type|href|height|width",function(e,t,n){if(!n)return e.getAttribute(t,"type"===t.toLowerCase()?1:2)}),d.attributes&&ce(function(e){return e.innerHTML="<input/>",e.firstChild.setAttribute("value",""),""===e.firstChild.getAttribute("value")})||fe("value",function(e,t,n){if(!n&&"input"===e.nodeName.toLowerCase())return e.defaultValue}),ce(function(e){return null==e.getAttribute("disabled")})||fe(R,function(e,t,n){var r;if(!n)return!0===e[t]?t.toLowerCase():(r=e.getAttributeNode(t))&&r.specified?r.value:null}),se}(C);k.find=h,k.expr=h.selectors,k.expr[":"]=k.expr.pseudos,k.uniqueSort=k.unique=h.uniqueSort,k.text=h.getText,k.isXMLDoc=h.isXML,k.contains=h.contains,k.escapeSelector=h.escape;var T=function(e,t,n){var r=[],i=void 0!==n;while((e=e[t])&&9!==e.nodeType)if(1===e.nodeType){if(i&&k(e).is(n))break;r.push(e)}return r},S=function(e,t){for(var n=[];e;e=e.nextSibling)1===e.nodeType&&e!==t&&n.push(e);return n},N=k.expr.match.needsContext;function A(e,t){return e.nodeName&&e.nodeName.toLowerCase()===t.toLowerCase()}var D=/^<([a-z][^\/\0>:\x20\t\r\n\f]*)[\x20\t\r\n\f]*\/?>(?:<\/\1>|)$/i;function j(e,n,r){return m(n)?k.grep(e,function(e,t){return!!n.call(e,t,e)!==r}):n.nodeType?k.grep(e,function(e){return e===n!==r}):"string"!=typeof n?k.grep(e,function(e){return-1<i.call(n,e)!==r}):k.filter(n,e,r)}k.filter=function(e,t,n){var r=t[0];return n&&(e=":not("+e+")"),1===t.length&&1===r.nodeType?k.find.matchesSelector(r,e)?[r]:[]:k.find.matches(e,k.grep(t,function(e){return 1===e.nodeType}))},k.fn.extend({find:function(e){var t,n,r=this.length,i=this;if("string"!=typeof e)return this.pushStack(k(e).filter(function(){for(t=0;t<r;t++)if(k.contains(i[t],this))return!0}));for(n=this.pushStack([]),t=0;t<r;t++)k.find(e,i[t],n);return 1<r?k.uniqueSort(n):n},filter:function(e){return this.pushStack(j(this,e||[],!1))},not:function(e){return this.pushStack(j(this,e||[],!0))},is:function(e){return!!j(this,"string"==typeof e&&N.test(e)?k(e):e||[],!1).length}});var q,L=/^(?:\s*(<[\w\W]+>)[^>]*|#([\w-]+))$/;(k.fn.init=function(e,t,n){var r,i;if(!e)return this;if(n=n||q,"string"==typeof e){if(!(r="<"===e[0]&&">"===e[e.length-1]&&3<=e.length?[null,e,null]:L.exec(e))||!r[1]&&t)return!t||t.jquery?(t||n).find(e):this.constructor(t).find(e);if(r[1]){if(t=t instanceof k?t[0]:t,k.merge(this,k.parseHTML(r[1],t&&t.nodeType?t.ownerDocument||t:E,!0)),D.test(r[1])&&k.isPlainObject(t))for(r in t)m(this[r])?this[r](t[r]):this.attr(r,t[r]);return this}return(i=E.getElementById(r[2]))&&(this[0]=i,this.length=1),this}return e.nodeType?(this[0]=e,this.length=1,this):m(e)?void 0!==n.ready?n.ready(e):e(k):k.makeArray(e,this)}).prototype=k.fn,q=k(E);var H=/^(?:parents|prev(?:Until|All))/,O={children:!0,contents:!0,next:!0,prev:!0};function P(e,t){while((e=e[t])&&1!==e.nodeType);return e}k.fn.extend({has:function(e){var t=k(e,this),n=t.length;return this.filter(function(){for(var e=0;e<n;e++)if(k.contains(this,t[e]))return!0})},closest:function(e,t){var n,r=0,i=this.length,o=[],a="string"!=typeof e&&k(e);if(!N.test(e))for(;r<i;r++)for(n=this[r];n&&n!==t;n=n.parentNode)if(n.nodeType<11&&(a?-1<a.index(n):1===n.nodeType&&k.find.matchesSelector(n,e))){o.push(n);break}return this.pushStack(1<o.length?k.uniqueSort(o):o)},index:function(e){return e?"string"==typeof e?i.call(k(e),this[0]):i.call(this,e.jquery?e[0]:e):this[0]&&this[0].parentNode?this.first().prevAll().length:-1},add:function(e,t){return this.pushStack(k.uniqueSort(k.merge(this.get(),k(e,t))))},addBack:function(e){return this.add(null==e?this.prevObject:this.prevObject.filter(e))}}),k.each({parent:function(e){var t=e.parentNode;return t&&11!==t.nodeType?t:null},parents:function(e){return T(e,"parentNode")},parentsUntil:function(e,t,n){return T(e,"parentNode",n)},next:function(e){return P(e,"nextSibling")},prev:function(e){return P(e,"previousSibling")},nextAll:function(e){return T(e,"nextSibling")},prevAll:function(e){return T(e,"previousSibling")},nextUntil:function(e,t,n){return T(e,"nextSibling",n)},prevUntil:function(e,t,n){return T(e,"previousSibling",n)},siblings:function(e){return S((e.parentNode||{}).firstChild,e)},children:function(e){return S(e.firstChild)},contents:function(e){return"undefined"!=typeof e.contentDocument?e.contentDocument:(A(e,"template")&&(e=e.content||e),k.merge([],e.childNodes))}},function(r,i){k.fn[r]=function(e,t){var n=k.map(this,i,e);return"Until"!==r.slice(-5)&&(t=e),t&&"string"==typeof t&&(n=k.filter(t,n)),1<this.length&&(O[r]||k.uniqueSort(n),H.test(r)&&n.reverse()),this.pushStack(n)}});var R=/[^\x20\t\r\n\f]+/g;function M(e){return e}function I(e){throw e}function W(e,t,n,r){var i;try{e&&m(i=e.promise)?i.call(e).done(t).fail(n):e&&m(i=e.then)?i.call(e,t,n):t.apply(void 0,[e].slice(r))}catch(e){n.apply(void 0,[e])}}k.Callbacks=function(r){var e,n;r="string"==typeof r?(e=r,n={},k.each(e.match(R)||[],function(e,t){n[t]=!0}),n):k.extend({},r);var i,t,o,a,s=[],u=[],l=-1,c=function(){for(a=a||r.once,o=i=!0;u.length;l=-1){t=u.shift();while(++l<s.length)!1===s[l].apply(t[0],t[1])&&r.stopOnFalse&&(l=s.length,t=!1)}r.memory||(t=!1),i=!1,a&&(s=t?[]:"")},f={add:function(){return s&&(t&&!i&&(l=s.length-1,u.push(t)),function n(e){k.each(e,function(e,t){m(t)?r.unique&&f.has(t)||s.push(t):t&&t.length&&"string"!==w(t)&&n(t)})}(arguments),t&&!i&&c()),this},remove:function(){return k.each(arguments,function(e,t){var n;while(-1<(n=k.inArray(t,s,n)))s.splice(n,1),n<=l&&l--}),this},has:function(e){return e?-1<k.inArray(e,s):0<s.length},empty:function(){return s&&(s=[]),this},disable:function(){return a=u=[],s=t="",this},disabled:function(){return!s},lock:function(){return a=u=[],t||i||(s=t=""),this},locked:function(){return!!a},fireWith:function(e,t){return a||(t=[e,(t=t||[]).slice?t.slice():t],u.push(t),i||c()),this},fire:function(){return f.fireWith(this,arguments),this},fired:function(){return!!o}};return f},k.extend({Deferred:function(e){var o=[["notify","progress",k.Callbacks("memory"),k.Callbacks("memory"),2],["resolve","done",k.Callbacks("once memory"),k.Callbacks("once memory"),0,"resolved"],["reject","fail",k.Callbacks("once memory"),k.Callbacks("once memory"),1,"rejected"]],i="pending",a={state:function(){return i},always:function(){return s.done(arguments).fail(arguments),this},"catch":function(e){return a.then(null,e)},pipe:function(){var i=arguments;return k.Deferred(function(r){k.each(o,function(e,t){var n=m(i[t[4]])&&i[t[4]];s[t[1]](function(){var e=n&&n.apply(this,arguments);e&&m(e.promise)?e.promise().progress(r.notify).done(r.resolve).fail(r.reject):r[t[0]+"With"](this,n?[e]:arguments)})}),i=null}).promise()},then:function(t,n,r){var u=0;function l(i,o,a,s){return function(){var n=this,r=arguments,e=function(){var e,t;if(!(i<u)){if((e=a.apply(n,r))===o.promise())throw new TypeError("Thenable self-resolution");t=e&&("object"==typeof e||"function"==typeof e)&&e.then,m(t)?s?t.call(e,l(u,o,M,s),l(u,o,I,s)):(u++,t.call(e,l(u,o,M,s),l(u,o,I,s),l(u,o,M,o.notifyWith))):(a!==M&&(n=void 0,r=[e]),(s||o.resolveWith)(n,r))}},t=s?e:function(){try{e()}catch(e){k.Deferred.exceptionHook&&k.Deferred.exceptionHook(e,t.stackTrace),u<=i+1&&(a!==I&&(n=void 0,r=[e]),o.rejectWith(n,r))}};i?t():(k.Deferred.getStackHook&&(t.stackTrace=k.Deferred.getStackHook()),C.setTimeout(t))}}return k.Deferred(function(e){o[0][3].add(l(0,e,m(r)?r:M,e.notifyWith)),o[1][3].add(l(0,e,m(t)?t:M)),o[2][3].add(l(0,e,m(n)?n:I))}).promise()},promise:function(e){return null!=e?k.extend(e,a):a}},s={};return k.each(o,function(e,t){var n=t[2],r=t[5];a[t[1]]=n.add,r&&n.add(function(){i=r},o[3-e][2].disable,o[3-e][3].disable,o[0][2].lock,o[0][3].lock),n.add(t[3].fire),s[t[0]]=function(){return s[t[0]+"With"](this===s?void 0:this,arguments),this},s[t[0]+"With"]=n.fireWith}),a.promise(s),e&&e.call(s,s),s},when:function(e){var n=arguments.length,t=n,r=Array(t),i=s.call(arguments),o=k.Deferred(),a=function(t){return function(e){r[t]=this,i[t]=1<arguments.length?s.call(arguments):e,--n||o.resolveWith(r,i)}};if(n<=1&&(W(e,o.done(a(t)).resolve,o.reject,!n),"pending"===o.state()||m(i[t]&&i[t].then)))return o.then();while(t--)W(i[t],a(t),o.reject);return o.promise()}});var $=/^(Eval|Internal|Range|Reference|Syntax|Type|URI)Error$/;k.Deferred.exceptionHook=function(e,t){C.console&&C.console.warn&&e&&$.test(e.name)&&C.console.warn("jQuery.Deferred exception: "+e.message,e.stack,t)},k.readyException=function(e){C.setTimeout(function(){throw e})};var F=k.Deferred();function B(){E.removeEventListener("DOMContentLoaded",B),C.removeEventListener("load",B),k.ready()}k.fn.ready=function(e){return F.then(e)["catch"](function(e){k.readyException(e)}),this},k.extend({isReady:!1,readyWait:1,ready:function(e){(!0===e?--k.readyWait:k.isReady)||(k.isReady=!0)!==e&&0<--k.readyWait||F.resolveWith(E,[k])}}),k.ready.then=F.then,"complete"===E.readyState||"loading"!==E.readyState&&!E.documentElement.doScroll?C.setTimeout(k.ready):(E.addEventListener("DOMContentLoaded",B),C.addEventListener("load",B));var _=function(e,t,n,r,i,o,a){var s=0,u=e.length,l=null==n;if("object"===w(n))for(s in i=!0,n)_(e,t,s,n[s],!0,o,a);else if(void 0!==r&&(i=!0,m(r)||(a=!0),l&&(a?(t.call(e,r),t=null):(l=t,t=function(e,t,n){return l.call(k(e),n)})),t))for(;s<u;s++)t(e[s],n,a?r:r.call(e[s],s,t(e[s],n)));return i?e:l?t.call(e):u?t(e[0],n):o},z=/^-ms-/,U=/-([a-z])/g;function X(e,t){return t.toUpperCase()}function V(e){return e.replace(z,"ms-").replace(U,X)}var G=function(e){return 1===e.nodeType||9===e.nodeType||!+e.nodeType};function Y(){this.expando=k.expando+Y.uid++}Y.uid=1,Y.prototype={cache:function(e){var t=e[this.expando];return t||(t={},G(e)&&(e.nodeType?e[this.expando]=t:Object.defineProperty(e,this.expando,{value:t,configurable:!0}))),t},set:function(e,t,n){var r,i=this.cache(e);if("string"==typeof t)i[V(t)]=n;else for(r in t)i[V(r)]=t[r];return i},get:function(e,t){return void 0===t?this.cache(e):e[this.expando]&&e[this.expando][V(t)]},access:function(e,t,n){return void 0===t||t&&"string"==typeof t&&void 0===n?this.get(e,t):(this.set(e,t,n),void 0!==n?n:t)},remove:function(e,t){var n,r=e[this.expando];if(void 0!==r){if(void 0!==t){n=(t=Array.isArray(t)?t.map(V):(t=V(t))in r?[t]:t.match(R)||[]).length;while(n--)delete r[t[n]]}(void 0===t||k.isEmptyObject(r))&&(e.nodeType?e[this.expando]=void 0:delete e[this.expando])}},hasData:function(e){var t=e[this.expando];return void 0!==t&&!k.isEmptyObject(t)}};var Q=new Y,J=new Y,K=/^(?:\{[\w\W]*\}|\[[\w\W]*\])$/,Z=/[A-Z]/g;function ee(e,t,n){var r,i;if(void 0===n&&1===e.nodeType)if(r="data-"+t.replace(Z,"-$&").toLowerCase(),"string"==typeof(n=e.getAttribute(r))){try{n="true"===(i=n)||"false"!==i&&("null"===i?null:i===+i+""?+i:K.test(i)?JSON.parse(i):i)}catch(e){}J.set(e,t,n)}else n=void 0;return n}k.extend({hasData:function(e){return J.hasData(e)||Q.hasData(e)},data:function(e,t,n){return J.access(e,t,n)},removeData:function(e,t){J.remove(e,t)},_data:function(e,t,n){return Q.access(e,t,n)},_removeData:function(e,t){Q.remove(e,t)}}),k.fn.extend({data:function(n,e){var t,r,i,o=this[0],a=o&&o.attributes;if(void 0===n){if(this.length&&(i=J.get(o),1===o.nodeType&&!Q.get(o,"hasDataAttrs"))){t=a.length;while(t--)a[t]&&0===(r=a[t].name).indexOf("data-")&&(r=V(r.slice(5)),ee(o,r,i[r]));Q.set(o,"hasDataAttrs",!0)}return i}return"object"==typeof n?this.each(function(){J.set(this,n)}):_(this,function(e){var t;if(o&&void 0===e)return void 0!==(t=J.get(o,n))?t:void 0!==(t=ee(o,n))?t:void 0;this.each(function(){J.set(this,n,e)})},null,e,1<arguments.length,null,!0)},removeData:function(e){return this.each(function(){J.remove(this,e)})}}),k.extend({queue:function(e,t,n){var r;if(e)return t=(t||"fx")+"queue",r=Q.get(e,t),n&&(!r||Array.isArray(n)?r=Q.access(e,t,k.makeArray(n)):r.push(n)),r||[]},dequeue:function(e,t){t=t||"fx";var n=k.queue(e,t),r=n.length,i=n.shift(),o=k._queueHooks(e,t);"inprogress"===i&&(i=n.shift(),r--),i&&("fx"===t&&n.unshift("inprogress"),delete o.stop,i.call(e,function(){k.dequeue(e,t)},o)),!r&&o&&o.empty.fire()},_queueHooks:function(e,t){var n=t+"queueHooks";return Q.get(e,n)||Q.access(e,n,{empty:k.Callbacks("once memory").add(function(){Q.remove(e,[t+"queue",n])})})}}),k.fn.extend({queue:function(t,n){var e=2;return"string"!=typeof t&&(n=t,t="fx",e--),arguments.length<e?k.queue(this[0],t):void 0===n?this:this.each(function(){var e=k.queue(this,t,n);k._queueHooks(this,t),"fx"===t&&"inprogress"!==e[0]&&k.dequeue(this,t)})},dequeue:function(e){return this.each(function(){k.dequeue(this,e)})},clearQueue:function(e){return this.queue(e||"fx",[])},promise:function(e,t){var n,r=1,i=k.Deferred(),o=this,a=this.length,s=function(){--r||i.resolveWith(o,[o])};"string"!=typeof e&&(t=e,e=void 0),e=e||"fx";while(a--)(n=Q.get(o[a],e+"queueHooks"))&&n.empty&&(r++,n.empty.add(s));return s(),i.promise(t)}});var te=/[+-]?(?:\d*\.|)\d+(?:[eE][+-]?\d+|)/.source,ne=new RegExp("^(?:([+-])=|)("+te+")([a-z%]*)$","i"),re=["Top","Right","Bottom","Left"],ie=E.documentElement,oe=function(e){return k.contains(e.ownerDocument,e)},ae={composed:!0};ie.getRootNode&&(oe=function(e){return k.contains(e.ownerDocument,e)||e.getRootNode(ae)===e.ownerDocument});var se=function(e,t){return"none"===(e=t||e).style.display||""===e.style.display&&oe(e)&&"none"===k.css(e,"display")},ue=function(e,t,n,r){var i,o,a={};for(o in t)a[o]=e.style[o],e.style[o]=t[o];for(o in i=n.apply(e,r||[]),t)e.style[o]=a[o];return i};function le(e,t,n,r){var i,o,a=20,s=r?function(){return r.cur()}:function(){return k.css(e,t,"")},u=s(),l=n&&n[3]||(k.cssNumber[t]?"":"px"),c=e.nodeType&&(k.cssNumber[t]||"px"!==l&&+u)&&ne.exec(k.css(e,t));if(c&&c[3]!==l){u/=2,l=l||c[3],c=+u||1;while(a--)k.style(e,t,c+l),(1-o)*(1-(o=s()/u||.5))<=0&&(a=0),c/=o;c*=2,k.style(e,t,c+l),n=n||[]}return n&&(c=+c||+u||0,i=n[1]?c+(n[1]+1)*n[2]:+n[2],r&&(r.unit=l,r.start=c,r.end=i)),i}var ce={};function fe(e,t){for(var n,r,i,o,a,s,u,l=[],c=0,f=e.length;c<f;c++)(r=e[c]).style&&(n=r.style.display,t?("none"===n&&(l[c]=Q.get(r,"display")||null,l[c]||(r.style.display="")),""===r.style.display&&se(r)&&(l[c]=(u=a=o=void 0,a=(i=r).ownerDocument,s=i.nodeName,(u=ce[s])||(o=a.body.appendChild(a.createElement(s)),u=k.css(o,"display"),o.parentNode.removeChild(o),"none"===u&&(u="block"),ce[s]=u)))):"none"!==n&&(l[c]="none",Q.set(r,"display",n)));for(c=0;c<f;c++)null!=l[c]&&(e[c].style.display=l[c]);return e}k.fn.extend({show:function(){return fe(this,!0)},hide:function(){return fe(this)},toggle:function(e){return"boolean"==typeof e?e?this.show():this.hide():this.each(function(){se(this)?k(this).show():k(this).hide()})}});var pe=/^(?:checkbox|radio)$/i,de=/<([a-z][^\/\0>\x20\t\r\n\f]*)/i,he=/^$|^module$|\/(?:java|ecma)script/i,ge={option:[1,"<select multiple='multiple'>","</select>"],thead:[1,"<table>","</table>"],col:[2,"<table><colgroup>","</colgroup></table>"],tr:[2,"<table><tbody>","</tbody></table>"],td:[3,"<table><tbody><tr>","</tr></tbody></table>"],_default:[0,"",""]};function ve(e,t){var n;return n="undefined"!=typeof e.getElementsByTagName?e.getElementsByTagName(t||"*"):"undefined"!=typeof e.querySelectorAll?e.querySelectorAll(t||"*"):[],void 0===t||t&&A(e,t)?k.merge([e],n):n}function ye(e,t){for(var n=0,r=e.length;n<r;n++)Q.set(e[n],"globalEval",!t||Q.get(t[n],"globalEval"))}ge.optgroup=ge.option,ge.tbody=ge.tfoot=ge.colgroup=ge.caption=ge.thead,ge.th=ge.td;var me,xe,be=/<|&#?\w+;/;function we(e,t,n,r,i){for(var o,a,s,u,l,c,f=t.createDocumentFragment(),p=[],d=0,h=e.length;d<h;d++)if((o=e[d])||0===o)if("object"===w(o))k.merge(p,o.nodeType?[o]:o);else if(be.test(o)){a=a||f.appendChild(t.createElement("div")),s=(de.exec(o)||["",""])[1].toLowerCase(),u=ge[s]||ge._default,a.innerHTML=u[1]+k.htmlPrefilter(o)+u[2],c=u[0];while(c--)a=a.lastChild;k.merge(p,a.childNodes),(a=f.firstChild).textContent=""}else p.push(t.createTextNode(o));f.textContent="",d=0;while(o=p[d++])if(r&&-1<k.inArray(o,r))i&&i.push(o);else if(l=oe(o),a=ve(f.appendChild(o),"script"),l&&ye(a),n){c=0;while(o=a[c++])he.test(o.type||"")&&n.push(o)}return f}me=E.createDocumentFragment().appendChild(E.createElement("div")),(xe=E.createElement("input")).setAttribute("type","radio"),xe.setAttribute("checked","checked"),xe.setAttribute("name","t"),me.appendChild(xe),y.checkClone=me.cloneNode(!0).cloneNode(!0).lastChild.checked,me.innerHTML="<textarea>x</textarea>",y.noCloneChecked=!!me.cloneNode(!0).lastChild.defaultValue;var Te=/^key/,Ce=/^(?:mouse|pointer|contextmenu|drag|drop)|click/,Ee=/^([^.]*)(?:\.(.+)|)/;function ke(){return!0}function Se(){return!1}function Ne(e,t){return e===function(){try{return E.activeElement}catch(e){}}()==("focus"===t)}function Ae(e,t,n,r,i,o){var a,s;if("object"==typeof t){for(s in"string"!=typeof n&&(r=r||n,n=void 0),t)Ae(e,s,n,r,t[s],o);return e}if(null==r&&null==i?(i=n,r=n=void 0):null==i&&("string"==typeof n?(i=r,r=void 0):(i=r,r=n,n=void 0)),!1===i)i=Se;else if(!i)return e;return 1===o&&(a=i,(i=function(e){return k().off(e),a.apply(this,arguments)}).guid=a.guid||(a.guid=k.guid++)),e.each(function(){k.event.add(this,t,i,r,n)})}function De(e,i,o){o?(Q.set(e,i,!1),k.event.add(e,i,{namespace:!1,handler:function(e){var t,n,r=Q.get(this,i);if(1&e.isTrigger&&this[i]){if(r.length)(k.event.special[i]||{}).delegateType&&e.stopPropagation();else if(r=s.call(arguments),Q.set(this,i,r),t=o(this,i),this[i](),r!==(n=Q.get(this,i))||t?Q.set(this,i,!1):n={},r!==n)return e.stopImmediatePropagation(),e.preventDefault(),n.value}else r.length&&(Q.set(this,i,{value:k.event.trigger(k.extend(r[0],k.Event.prototype),r.slice(1),this)}),e.stopImmediatePropagation())}})):void 0===Q.get(e,i)&&k.event.add(e,i,ke)}k.event={global:{},add:function(t,e,n,r,i){var o,a,s,u,l,c,f,p,d,h,g,v=Q.get(t);if(v){n.handler&&(n=(o=n).handler,i=o.selector),i&&k.find.matchesSelector(ie,i),n.guid||(n.guid=k.guid++),(u=v.events)||(u=v.events={}),(a=v.handle)||(a=v.handle=function(e){return"undefined"!=typeof k&&k.event.triggered!==e.type?k.event.dispatch.apply(t,arguments):void 0}),l=(e=(e||"").match(R)||[""]).length;while(l--)d=g=(s=Ee.exec(e[l])||[])[1],h=(s[2]||"").split(".").sort(),d&&(f=k.event.special[d]||{},d=(i?f.delegateType:f.bindType)||d,f=k.event.special[d]||{},c=k.extend({type:d,origType:g,data:r,handler:n,guid:n.guid,selector:i,needsContext:i&&k.expr.match.needsContext.test(i),namespace:h.join(".")},o),(p=u[d])||((p=u[d]=[]).delegateCount=0,f.setup&&!1!==f.setup.call(t,r,h,a)||t.addEventListener&&t.addEventListener(d,a)),f.add&&(f.add.call(t,c),c.handler.guid||(c.handler.guid=n.guid)),i?p.splice(p.delegateCount++,0,c):p.push(c),k.event.global[d]=!0)}},remove:function(e,t,n,r,i){var o,a,s,u,l,c,f,p,d,h,g,v=Q.hasData(e)&&Q.get(e);if(v&&(u=v.events)){l=(t=(t||"").match(R)||[""]).length;while(l--)if(d=g=(s=Ee.exec(t[l])||[])[1],h=(s[2]||"").split(".").sort(),d){f=k.event.special[d]||{},p=u[d=(r?f.delegateType:f.bindType)||d]||[],s=s[2]&&new RegExp("(^|\\.)"+h.join("\\.(?:.*\\.|)")+"(\\.|$)"),a=o=p.length;while(o--)c=p[o],!i&&g!==c.origType||n&&n.guid!==c.guid||s&&!s.test(c.namespace)||r&&r!==c.selector&&("**"!==r||!c.selector)||(p.splice(o,1),c.selector&&p.delegateCount--,f.remove&&f.remove.call(e,c));a&&!p.length&&(f.teardown&&!1!==f.teardown.call(e,h,v.handle)||k.removeEvent(e,d,v.handle),delete u[d])}else for(d in u)k.event.remove(e,d+t[l],n,r,!0);k.isEmptyObject(u)&&Q.remove(e,"handle events")}},dispatch:function(e){var t,n,r,i,o,a,s=k.event.fix(e),u=new Array(arguments.length),l=(Q.get(this,"events")||{})[s.type]||[],c=k.event.special[s.type]||{};for(u[0]=s,t=1;t<arguments.length;t++)u[t]=arguments[t];if(s.delegateTarget=this,!c.preDispatch||!1!==c.preDispatch.call(this,s)){a=k.event.handlers.call(this,s,l),t=0;while((i=a[t++])&&!s.isPropagationStopped()){s.currentTarget=i.elem,n=0;while((o=i.handlers[n++])&&!s.isImmediatePropagationStopped())s.rnamespace&&!1!==o.namespace&&!s.rnamespace.test(o.namespace)||(s.handleObj=o,s.data=o.data,void 0!==(r=((k.event.special[o.origType]||{}).handle||o.handler).apply(i.elem,u))&&!1===(s.result=r)&&(s.preventDefault(),s.stopPropagation()))}return c.postDispatch&&c.postDispatch.call(this,s),s.result}},handlers:function(e,t){var n,r,i,o,a,s=[],u=t.delegateCount,l=e.target;if(u&&l.nodeType&&!("click"===e.type&&1<=e.button))for(;l!==this;l=l.parentNode||this)if(1===l.nodeType&&("click"!==e.type||!0!==l.disabled)){for(o=[],a={},n=0;n<u;n++)void 0===a[i=(r=t[n]).selector+" "]&&(a[i]=r.needsContext?-1<k(i,this).index(l):k.find(i,this,null,[l]).length),a[i]&&o.push(r);o.length&&s.push({elem:l,handlers:o})}return l=this,u<t.length&&s.push({elem:l,handlers:t.slice(u)}),s},addProp:function(t,e){Object.defineProperty(k.Event.prototype,t,{enumerable:!0,configurable:!0,get:m(e)?function(){if(this.originalEvent)return e(this.originalEvent)}:function(){if(this.originalEvent)return this.originalEvent[t]},set:function(e){Object.defineProperty(this,t,{enumerable:!0,configurable:!0,writable:!0,value:e})}})},fix:function(e){return e[k.expando]?e:new k.Event(e)},special:{load:{noBubble:!0},click:{setup:function(e){var t=this||e;return pe.test(t.type)&&t.click&&A(t,"input")&&De(t,"click",ke),!1},trigger:function(e){var t=this||e;return pe.test(t.type)&&t.click&&A(t,"input")&&De(t,"click"),!0},_default:function(e){var t=e.target;return pe.test(t.type)&&t.click&&A(t,"input")&&Q.get(t,"click")||A(t,"a")}},beforeunload:{postDispatch:function(e){void 0!==e.result&&e.originalEvent&&(e.originalEvent.returnValue=e.result)}}}},k.removeEvent=function(e,t,n){e.removeEventListener&&e.removeEventListener(t,n)},k.Event=function(e,t){if(!(this instanceof k.Event))return new k.Event(e,t);e&&e.type?(this.originalEvent=e,this.type=e.type,this.isDefaultPrevented=e.defaultPrevented||void 0===e.defaultPrevented&&!1===e.returnValue?ke:Se,this.target=e.target&&3===e.target.nodeType?e.target.parentNode:e.target,this.currentTarget=e.currentTarget,this.relatedTarget=e.relatedTarget):this.type=e,t&&k.extend(this,t),this.timeStamp=e&&e.timeStamp||Date.now(),this[k.expando]=!0},k.Event.prototype={constructor:k.Event,isDefaultPrevented:Se,isPropagationStopped:Se,isImmediatePropagationStopped:Se,isSimulated:!1,preventDefault:function(){var e=this.originalEvent;this.isDefaultPrevented=ke,e&&!this.isSimulated&&e.preventDefault()},stopPropagation:function(){var e=this.originalEvent;this.isPropagationStopped=ke,e&&!this.isSimulated&&e.stopPropagation()},stopImmediatePropagation:function(){var e=this.originalEvent;this.isImmediatePropagationStopped=ke,e&&!this.isSimulated&&e.stopImmediatePropagation(),this.stopPropagation()}},k.each({altKey:!0,bubbles:!0,cancelable:!0,changedTouches:!0,ctrlKey:!0,detail:!0,eventPhase:!0,metaKey:!0,pageX:!0,pageY:!0,shiftKey:!0,view:!0,"char":!0,code:!0,charCode:!0,key:!0,keyCode:!0,button:!0,buttons:!0,clientX:!0,clientY:!0,offsetX:!0,offsetY:!0,pointerId:!0,pointerType:!0,screenX:!0,screenY:!0,targetTouches:!0,toElement:!0,touches:!0,which:function(e){var t=e.button;return null==e.which&&Te.test(e.type)?null!=e.charCode?e.charCode:e.keyCode:!e.which&&void 0!==t&&Ce.test(e.type)?1&t?1:2&t?3:4&t?2:0:e.which}},k.event.addProp),k.each({focus:"focusin",blur:"focusout"},function(e,t){k.event.special[e]={setup:function(){return De(this,e,Ne),!1},trigger:function(){return De(this,e),!0},delegateType:t}}),k.each({mouseenter:"mouseover",mouseleave:"mouseout",pointerenter:"pointerover",pointerleave:"pointerout"},function(e,i){k.event.special[e]={delegateType:i,bindType:i,handle:function(e){var t,n=e.relatedTarget,r=e.handleObj;return n&&(n===this||k.contains(this,n))||(e.type=r.origType,t=r.handler.apply(this,arguments),e.type=i),t}}}),k.fn.extend({on:function(e,t,n,r){return Ae(this,e,t,n,r)},one:function(e,t,n,r){return Ae(this,e,t,n,r,1)},off:function(e,t,n){var r,i;if(e&&e.preventDefault&&e.handleObj)return r=e.handleObj,k(e.delegateTarget).off(r.namespace?r.origType+"."+r.namespace:r.origType,r.selector,r.handler),this;if("object"==typeof e){for(i in e)this.off(i,t,e[i]);return this}return!1!==t&&"function"!=typeof t||(n=t,t=void 0),!1===n&&(n=Se),this.each(function(){k.event.remove(this,e,n,t)})}});var je=/<(?!area|br|col|embed|hr|img|input|link|meta|param)(([a-z][^\/\0>\x20\t\r\n\f]*)[^>]*)\/>/gi,qe=/<script|<style|<link/i,Le=/checked\s*(?:[^=]|=\s*.checked.)/i,He=/^\s*<!(?:\[CDATA\[|--)|(?:\]\]|--)>\s*$/g;function Oe(e,t){return A(e,"table")&&A(11!==t.nodeType?t:t.firstChild,"tr")&&k(e).children("tbody")[0]||e}function Pe(e){return e.type=(null!==e.getAttribute("type"))+"/"+e.type,e}function Re(e){return"true/"===(e.type||"").slice(0,5)?e.type=e.type.slice(5):e.removeAttribute("type"),e}function Me(e,t){var n,r,i,o,a,s,u,l;if(1===t.nodeType){if(Q.hasData(e)&&(o=Q.access(e),a=Q.set(t,o),l=o.events))for(i in delete a.handle,a.events={},l)for(n=0,r=l[i].length;n<r;n++)k.event.add(t,i,l[i][n]);J.hasData(e)&&(s=J.access(e),u=k.extend({},s),J.set(t,u))}}function Ie(n,r,i,o){r=g.apply([],r);var e,t,a,s,u,l,c=0,f=n.length,p=f-1,d=r[0],h=m(d);if(h||1<f&&"string"==typeof d&&!y.checkClone&&Le.test(d))return n.each(function(e){var t=n.eq(e);h&&(r[0]=d.call(this,e,t.html())),Ie(t,r,i,o)});if(f&&(t=(e=we(r,n[0].ownerDocument,!1,n,o)).firstChild,1===e.childNodes.length&&(e=t),t||o)){for(s=(a=k.map(ve(e,"script"),Pe)).length;c<f;c++)u=e,c!==p&&(u=k.clone(u,!0,!0),s&&k.merge(a,ve(u,"script"))),i.call(n[c],u,c);if(s)for(l=a[a.length-1].ownerDocument,k.map(a,Re),c=0;c<s;c++)u=a[c],he.test(u.type||"")&&!Q.access(u,"globalEval")&&k.contains(l,u)&&(u.src&&"module"!==(u.type||"").toLowerCase()?k._evalUrl&&!u.noModule&&k._evalUrl(u.src,{nonce:u.nonce||u.getAttribute("nonce")}):b(u.textContent.replace(He,""),u,l))}return n}function We(e,t,n){for(var r,i=t?k.filter(t,e):e,o=0;null!=(r=i[o]);o++)n||1!==r.nodeType||k.cleanData(ve(r)),r.parentNode&&(n&&oe(r)&&ye(ve(r,"script")),r.parentNode.removeChild(r));return e}k.extend({htmlPrefilter:function(e){return e.replace(je,"<$1></$2>")},clone:function(e,t,n){var r,i,o,a,s,u,l,c=e.cloneNode(!0),f=oe(e);if(!(y.noCloneChecked||1!==e.nodeType&&11!==e.nodeType||k.isXMLDoc(e)))for(a=ve(c),r=0,i=(o=ve(e)).length;r<i;r++)s=o[r],u=a[r],void 0,"input"===(l=u.nodeName.toLowerCase())&&pe.test(s.type)?u.checked=s.checked:"input"!==l&&"textarea"!==l||(u.defaultValue=s.defaultValue);if(t)if(n)for(o=o||ve(e),a=a||ve(c),r=0,i=o.length;r<i;r++)Me(o[r],a[r]);else Me(e,c);return 0<(a=ve(c,"script")).length&&ye(a,!f&&ve(e,"script")),c},cleanData:function(e){for(var t,n,r,i=k.event.special,o=0;void 0!==(n=e[o]);o++)if(G(n)){if(t=n[Q.expando]){if(t.events)for(r in t.events)i[r]?k.event.remove(n,r):k.removeEvent(n,r,t.handle);n[Q.expando]=void 0}n[J.expando]&&(n[J.expando]=void 0)}}}),k.fn.extend({detach:function(e){return We(this,e,!0)},remove:function(e){return We(this,e)},text:function(e){return _(this,function(e){return void 0===e?k.text(this):this.empty().each(function(){1!==this.nodeType&&11!==this.nodeType&&9!==this.nodeType||(this.textContent=e)})},null,e,arguments.length)},append:function(){return Ie(this,arguments,function(e){1!==this.nodeType&&11!==this.nodeType&&9!==this.nodeType||Oe(this,e).appendChild(e)})},prepend:function(){return Ie(this,arguments,function(e){if(1===this.nodeType||11===this.nodeType||9===this.nodeType){var t=Oe(this,e);t.insertBefore(e,t.firstChild)}})},before:function(){return Ie(this,arguments,function(e){this.parentNode&&this.parentNode.insertBefore(e,this)})},after:function(){return Ie(this,arguments,function(e){this.parentNode&&this.parentNode.insertBefore(e,this.nextSibling)})},empty:function(){for(var e,t=0;null!=(e=this[t]);t++)1===e.nodeType&&(k.cleanData(ve(e,!1)),e.textContent="");return this},clone:function(e,t){return e=null!=e&&e,t=null==t?e:t,this.map(function(){return k.clone(this,e,t)})},html:function(e){return _(this,function(e){var t=this[0]||{},n=0,r=this.length;if(void 0===e&&1===t.nodeType)return t.innerHTML;if("string"==typeof e&&!qe.test(e)&&!ge[(de.exec(e)||["",""])[1].toLowerCase()]){e=k.htmlPrefilter(e);try{for(;n<r;n++)1===(t=this[n]||{}).nodeType&&(k.cleanData(ve(t,!1)),t.innerHTML=e);t=0}catch(e){}}t&&this.empty().append(e)},null,e,arguments.length)},replaceWith:function(){var n=[];return Ie(this,arguments,function(e){var t=this.parentNode;k.inArray(this,n)<0&&(k.cleanData(ve(this)),t&&t.replaceChild(e,this))},n)}}),k.each({appendTo:"append",prependTo:"prepend",insertBefore:"before",insertAfter:"after",replaceAll:"replaceWith"},function(e,a){k.fn[e]=function(e){for(var t,n=[],r=k(e),i=r.length-1,o=0;o<=i;o++)t=o===i?this:this.clone(!0),k(r[o])[a](t),u.apply(n,t.get());return this.pushStack(n)}});var $e=new RegExp("^("+te+")(?!px)[a-z%]+$","i"),Fe=function(e){var t=e.ownerDocument.defaultView;return t&&t.opener||(t=C),t.getComputedStyle(e)},Be=new RegExp(re.join("|"),"i");function _e(e,t,n){var r,i,o,a,s=e.style;return(n=n||Fe(e))&&(""!==(a=n.getPropertyValue(t)||n[t])||oe(e)||(a=k.style(e,t)),!y.pixelBoxStyles()&&$e.test(a)&&Be.test(t)&&(r=s.width,i=s.minWidth,o=s.maxWidth,s.minWidth=s.maxWidth=s.width=a,a=n.width,s.width=r,s.minWidth=i,s.maxWidth=o)),void 0!==a?a+"":a}function ze(e,t){return{get:function(){if(!e())return(this.get=t).apply(this,arguments);delete this.get}}}!function(){function e(){if(u){s.style.cssText="position:absolute;left:-11111px;width:60px;margin-top:1px;padding:0;border:0",u.style.cssText="position:relative;display:block;box-sizing:border-box;overflow:scroll;margin:auto;border:1px;padding:1px;width:60%;top:1%",ie.appendChild(s).appendChild(u);var e=C.getComputedStyle(u);n="1%"!==e.top,a=12===t(e.marginLeft),u.style.right="60%",o=36===t(e.right),r=36===t(e.width),u.style.position="absolute",i=12===t(u.offsetWidth/3),ie.removeChild(s),u=null}}function t(e){return Math.round(parseFloat(e))}var n,r,i,o,a,s=E.createElement("div"),u=E.createElement("div");u.style&&(u.style.backgroundClip="content-box",u.cloneNode(!0).style.backgroundClip="",y.clearCloneStyle="content-box"===u.style.backgroundClip,k.extend(y,{boxSizingReliable:function(){return e(),r},pixelBoxStyles:function(){return e(),o},pixelPosition:function(){return e(),n},reliableMarginLeft:function(){return e(),a},scrollboxSize:function(){return e(),i}}))}();var Ue=["Webkit","Moz","ms"],Xe=E.createElement("div").style,Ve={};function Ge(e){var t=k.cssProps[e]||Ve[e];return t||(e in Xe?e:Ve[e]=function(e){var t=e[0].toUpperCase()+e.slice(1),n=Ue.length;while(n--)if((e=Ue[n]+t)in Xe)return e}(e)||e)}var Ye=/^(none|table(?!-c[ea]).+)/,Qe=/^--/,Je={position:"absolute",visibility:"hidden",display:"block"},Ke={letterSpacing:"0",fontWeight:"400"};function Ze(e,t,n){var r=ne.exec(t);return r?Math.max(0,r[2]-(n||0))+(r[3]||"px"):t}function et(e,t,n,r,i,o){var a="width"===t?1:0,s=0,u=0;if(n===(r?"border":"content"))return 0;for(;a<4;a+=2)"margin"===n&&(u+=k.css(e,n+re[a],!0,i)),r?("content"===n&&(u-=k.css(e,"padding"+re[a],!0,i)),"margin"!==n&&(u-=k.css(e,"border"+re[a]+"Width",!0,i))):(u+=k.css(e,"padding"+re[a],!0,i),"padding"!==n?u+=k.css(e,"border"+re[a]+"Width",!0,i):s+=k.css(e,"border"+re[a]+"Width",!0,i));return!r&&0<=o&&(u+=Math.max(0,Math.ceil(e["offset"+t[0].toUpperCase()+t.slice(1)]-o-u-s-.5))||0),u}function tt(e,t,n){var r=Fe(e),i=(!y.boxSizingReliable()||n)&&"border-box"===k.css(e,"boxSizing",!1,r),o=i,a=_e(e,t,r),s="offset"+t[0].toUpperCase()+t.slice(1);if($e.test(a)){if(!n)return a;a="auto"}return(!y.boxSizingReliable()&&i||"auto"===a||!parseFloat(a)&&"inline"===k.css(e,"display",!1,r))&&e.getClientRects().length&&(i="border-box"===k.css(e,"boxSizing",!1,r),(o=s in e)&&(a=e[s])),(a=parseFloat(a)||0)+et(e,t,n||(i?"border":"content"),o,r,a)+"px"}function nt(e,t,n,r,i){return new nt.prototype.init(e,t,n,r,i)}k.extend({cssHooks:{opacity:{get:function(e,t){if(t){var n=_e(e,"opacity");return""===n?"1":n}}}},cssNumber:{animationIterationCount:!0,columnCount:!0,fillOpacity:!0,flexGrow:!0,flexShrink:!0,fontWeight:!0,gridArea:!0,gridColumn:!0,gridColumnEnd:!0,gridColumnStart:!0,gridRow:!0,gridRowEnd:!0,gridRowStart:!0,lineHeight:!0,opacity:!0,order:!0,orphans:!0,widows:!0,zIndex:!0,zoom:!0},cssProps:{},style:function(e,t,n,r){if(e&&3!==e.nodeType&&8!==e.nodeType&&e.style){var i,o,a,s=V(t),u=Qe.test(t),l=e.style;if(u||(t=Ge(s)),a=k.cssHooks[t]||k.cssHooks[s],void 0===n)return a&&"get"in a&&void 0!==(i=a.get(e,!1,r))?i:l[t];"string"===(o=typeof n)&&(i=ne.exec(n))&&i[1]&&(n=le(e,t,i),o="number"),null!=n&&n==n&&("number"!==o||u||(n+=i&&i[3]||(k.cssNumber[s]?"":"px")),y.clearCloneStyle||""!==n||0!==t.indexOf("background")||(l[t]="inherit"),a&&"set"in a&&void 0===(n=a.set(e,n,r))||(u?l.setProperty(t,n):l[t]=n))}},css:function(e,t,n,r){var i,o,a,s=V(t);return Qe.test(t)||(t=Ge(s)),(a=k.cssHooks[t]||k.cssHooks[s])&&"get"in a&&(i=a.get(e,!0,n)),void 0===i&&(i=_e(e,t,r)),"normal"===i&&t in Ke&&(i=Ke[t]),""===n||n?(o=parseFloat(i),!0===n||isFinite(o)?o||0:i):i}}),k.each(["height","width"],function(e,u){k.cssHooks[u]={get:function(e,t,n){if(t)return!Ye.test(k.css(e,"display"))||e.getClientRects().length&&e.getBoundingClientRect().width?tt(e,u,n):ue(e,Je,function(){return tt(e,u,n)})},set:function(e,t,n){var r,i=Fe(e),o=!y.scrollboxSize()&&"absolute"===i.position,a=(o||n)&&"border-box"===k.css(e,"boxSizing",!1,i),s=n?et(e,u,n,a,i):0;return a&&o&&(s-=Math.ceil(e["offset"+u[0].toUpperCase()+u.slice(1)]-parseFloat(i[u])-et(e,u,"border",!1,i)-.5)),s&&(r=ne.exec(t))&&"px"!==(r[3]||"px")&&(e.style[u]=t,t=k.css(e,u)),Ze(0,t,s)}}}),k.cssHooks.marginLeft=ze(y.reliableMarginLeft,function(e,t){if(t)return(parseFloat(_e(e,"marginLeft"))||e.getBoundingClientRect().left-ue(e,{marginLeft:0},function(){return e.getBoundingClientRect().left}))+"px"}),k.each({margin:"",padding:"",border:"Width"},function(i,o){k.cssHooks[i+o]={expand:function(e){for(var t=0,n={},r="string"==typeof e?e.split(" "):[e];t<4;t++)n[i+re[t]+o]=r[t]||r[t-2]||r[0];return n}},"margin"!==i&&(k.cssHooks[i+o].set=Ze)}),k.fn.extend({css:function(e,t){return _(this,function(e,t,n){var r,i,o={},a=0;if(Array.isArray(t)){for(r=Fe(e),i=t.length;a<i;a++)o[t[a]]=k.css(e,t[a],!1,r);return o}return void 0!==n?k.style(e,t,n):k.css(e,t)},e,t,1<arguments.length)}}),((k.Tween=nt).prototype={constructor:nt,init:function(e,t,n,r,i,o){this.elem=e,this.prop=n,this.easing=i||k.easing._default,this.options=t,this.start=this.now=this.cur(),this.end=r,this.unit=o||(k.cssNumber[n]?"":"px")},cur:function(){var e=nt.propHooks[this.prop];return e&&e.get?e.get(this):nt.propHooks._default.get(this)},run:function(e){var t,n=nt.propHooks[this.prop];return this.options.duration?this.pos=t=k.easing[this.easing](e,this.options.duration*e,0,1,this.options.duration):this.pos=t=e,this.now=(this.end-this.start)*t+this.start,this.options.step&&this.options.step.call(this.elem,this.now,this),n&&n.set?n.set(this):nt.propHooks._default.set(this),this}}).init.prototype=nt.prototype,(nt.propHooks={_default:{get:function(e){var t;return 1!==e.elem.nodeType||null!=e.elem[e.prop]&&null==e.elem.style[e.prop]?e.elem[e.prop]:(t=k.css(e.elem,e.prop,""))&&"auto"!==t?t:0},set:function(e){k.fx.step[e.prop]?k.fx.step[e.prop](e):1!==e.elem.nodeType||!k.cssHooks[e.prop]&&null==e.elem.style[Ge(e.prop)]?e.elem[e.prop]=e.now:k.style(e.elem,e.prop,e.now+e.unit)}}}).scrollTop=nt.propHooks.scrollLeft={set:function(e){e.elem.nodeType&&e.elem.parentNode&&(e.elem[e.prop]=e.now)}},k.easing={linear:function(e){return e},swing:function(e){return.5-Math.cos(e*Math.PI)/2},_default:"swing"},k.fx=nt.prototype.init,k.fx.step={};var rt,it,ot,at,st=/^(?:toggle|show|hide)$/,ut=/queueHooks$/;function lt(){it&&(!1===E.hidden&&C.requestAnimationFrame?C.requestAnimationFrame(lt):C.setTimeout(lt,k.fx.interval),k.fx.tick())}function ct(){return C.setTimeout(function(){rt=void 0}),rt=Date.now()}function ft(e,t){var n,r=0,i={height:e};for(t=t?1:0;r<4;r+=2-t)i["margin"+(n=re[r])]=i["padding"+n]=e;return t&&(i.opacity=i.width=e),i}function pt(e,t,n){for(var r,i=(dt.tweeners[t]||[]).concat(dt.tweeners["*"]),o=0,a=i.length;o<a;o++)if(r=i[o].call(n,t,e))return r}function dt(o,e,t){var n,a,r=0,i=dt.prefilters.length,s=k.Deferred().always(function(){delete u.elem}),u=function(){if(a)return!1;for(var e=rt||ct(),t=Math.max(0,l.startTime+l.duration-e),n=1-(t/l.duration||0),r=0,i=l.tweens.length;r<i;r++)l.tweens[r].run(n);return s.notifyWith(o,[l,n,t]),n<1&&i?t:(i||s.notifyWith(o,[l,1,0]),s.resolveWith(o,[l]),!1)},l=s.promise({elem:o,props:k.extend({},e),opts:k.extend(!0,{specialEasing:{},easing:k.easing._default},t),originalProperties:e,originalOptions:t,startTime:rt||ct(),duration:t.duration,tweens:[],createTween:function(e,t){var n=k.Tween(o,l.opts,e,t,l.opts.specialEasing[e]||l.opts.easing);return l.tweens.push(n),n},stop:function(e){var t=0,n=e?l.tweens.length:0;if(a)return this;for(a=!0;t<n;t++)l.tweens[t].run(1);return e?(s.notifyWith(o,[l,1,0]),s.resolveWith(o,[l,e])):s.rejectWith(o,[l,e]),this}}),c=l.props;for(!function(e,t){var n,r,i,o,a;for(n in e)if(i=t[r=V(n)],o=e[n],Array.isArray(o)&&(i=o[1],o=e[n]=o[0]),n!==r&&(e[r]=o,delete e[n]),(a=k.cssHooks[r])&&"expand"in a)for(n in o=a.expand(o),delete e[r],o)n in e||(e[n]=o[n],t[n]=i);else t[r]=i}(c,l.opts.specialEasing);r<i;r++)if(n=dt.prefilters[r].call(l,o,c,l.opts))return m(n.stop)&&(k._queueHooks(l.elem,l.opts.queue).stop=n.stop.bind(n)),n;return k.map(c,pt,l),m(l.opts.start)&&l.opts.start.call(o,l),l.progress(l.opts.progress).done(l.opts.done,l.opts.complete).fail(l.opts.fail).always(l.opts.always),k.fx.timer(k.extend(u,{elem:o,anim:l,queue:l.opts.queue})),l}k.Animation=k.extend(dt,{tweeners:{"*":[function(e,t){var n=this.createTween(e,t);return le(n.elem,e,ne.exec(t),n),n}]},tweener:function(e,t){m(e)?(t=e,e=["*"]):e=e.match(R);for(var n,r=0,i=e.length;r<i;r++)n=e[r],dt.tweeners[n]=dt.tweeners[n]||[],dt.tweeners[n].unshift(t)},prefilters:[function(e,t,n){var r,i,o,a,s,u,l,c,f="width"in t||"height"in t,p=this,d={},h=e.style,g=e.nodeType&&se(e),v=Q.get(e,"fxshow");for(r in n.queue||(null==(a=k._queueHooks(e,"fx")).unqueued&&(a.unqueued=0,s=a.empty.fire,a.empty.fire=function(){a.unqueued||s()}),a.unqueued++,p.always(function(){p.always(function(){a.unqueued--,k.queue(e,"fx").length||a.empty.fire()})})),t)if(i=t[r],st.test(i)){if(delete t[r],o=o||"toggle"===i,i===(g?"hide":"show")){if("show"!==i||!v||void 0===v[r])continue;g=!0}d[r]=v&&v[r]||k.style(e,r)}if((u=!k.isEmptyObject(t))||!k.isEmptyObject(d))for(r in f&&1===e.nodeType&&(n.overflow=[h.overflow,h.overflowX,h.overflowY],null==(l=v&&v.display)&&(l=Q.get(e,"display")),"none"===(c=k.css(e,"display"))&&(l?c=l:(fe([e],!0),l=e.style.display||l,c=k.css(e,"display"),fe([e]))),("inline"===c||"inline-block"===c&&null!=l)&&"none"===k.css(e,"float")&&(u||(p.done(function(){h.display=l}),null==l&&(c=h.display,l="none"===c?"":c)),h.display="inline-block")),n.overflow&&(h.overflow="hidden",p.always(function(){h.overflow=n.overflow[0],h.overflowX=n.overflow[1],h.overflowY=n.overflow[2]})),u=!1,d)u||(v?"hidden"in v&&(g=v.hidden):v=Q.access(e,"fxshow",{display:l}),o&&(v.hidden=!g),g&&fe([e],!0),p.done(function(){for(r in g||fe([e]),Q.remove(e,"fxshow"),d)k.style(e,r,d[r])})),u=pt(g?v[r]:0,r,p),r in v||(v[r]=u.start,g&&(u.end=u.start,u.start=0))}],prefilter:function(e,t){t?dt.prefilters.unshift(e):dt.prefilters.push(e)}}),k.speed=function(e,t,n){var r=e&&"object"==typeof e?k.extend({},e):{complete:n||!n&&t||m(e)&&e,duration:e,easing:n&&t||t&&!m(t)&&t};return k.fx.off?r.duration=0:"number"!=typeof r.duration&&(r.duration in k.fx.speeds?r.duration=k.fx.speeds[r.duration]:r.duration=k.fx.speeds._default),null!=r.queue&&!0!==r.queue||(r.queue="fx"),r.old=r.complete,r.complete=function(){m(r.old)&&r.old.call(this),r.queue&&k.dequeue(this,r.queue)},r},k.fn.extend({fadeTo:function(e,t,n,r){return this.filter(se).css("opacity",0).show().end().animate({opacity:t},e,n,r)},animate:function(t,e,n,r){var i=k.isEmptyObject(t),o=k.speed(e,n,r),a=function(){var e=dt(this,k.extend({},t),o);(i||Q.get(this,"finish"))&&e.stop(!0)};return a.finish=a,i||!1===o.queue?this.each(a):this.queue(o.queue,a)},stop:function(i,e,o){var a=function(e){var t=e.stop;delete e.stop,t(o)};return"string"!=typeof i&&(o=e,e=i,i=void 0),e&&!1!==i&&this.queue(i||"fx",[]),this.each(function(){var e=!0,t=null!=i&&i+"queueHooks",n=k.timers,r=Q.get(this);if(t)r[t]&&r[t].stop&&a(r[t]);else for(t in r)r[t]&&r[t].stop&&ut.test(t)&&a(r[t]);for(t=n.length;t--;)n[t].elem!==this||null!=i&&n[t].queue!==i||(n[t].anim.stop(o),e=!1,n.splice(t,1));!e&&o||k.dequeue(this,i)})},finish:function(a){return!1!==a&&(a=a||"fx"),this.each(function(){var e,t=Q.get(this),n=t[a+"queue"],r=t[a+"queueHooks"],i=k.timers,o=n?n.length:0;for(t.finish=!0,k.queue(this,a,[]),r&&r.stop&&r.stop.call(this,!0),e=i.length;e--;)i[e].elem===this&&i[e].queue===a&&(i[e].anim.stop(!0),i.splice(e,1));for(e=0;e<o;e++)n[e]&&n[e].finish&&n[e].finish.call(this);delete t.finish})}}),k.each(["toggle","show","hide"],function(e,r){var i=k.fn[r];k.fn[r]=function(e,t,n){return null==e||"boolean"==typeof e?i.apply(this,arguments):this.animate(ft(r,!0),e,t,n)}}),k.each({slideDown:ft("show"),slideUp:ft("hide"),slideToggle:ft("toggle"),fadeIn:{opacity:"show"},fadeOut:{opacity:"hide"},fadeToggle:{opacity:"toggle"}},function(e,r){k.fn[e]=function(e,t,n){return this.animate(r,e,t,n)}}),k.timers=[],k.fx.tick=function(){var e,t=0,n=k.timers;for(rt=Date.now();t<n.length;t++)(e=n[t])()||n[t]!==e||n.splice(t--,1);n.length||k.fx.stop(),rt=void 0},k.fx.timer=function(e){k.timers.push(e),k.fx.start()},k.fx.interval=13,k.fx.start=function(){it||(it=!0,lt())},k.fx.stop=function(){it=null},k.fx.speeds={slow:600,fast:200,_default:400},k.fn.delay=function(r,e){return r=k.fx&&k.fx.speeds[r]||r,e=e||"fx",this.queue(e,function(e,t){var n=C.setTimeout(e,r);t.stop=function(){C.clearTimeout(n)}})},ot=E.createElement("input"),at=E.createElement("select").appendChild(E.createElement("option")),ot.type="checkbox",y.checkOn=""!==ot.value,y.optSelected=at.selected,(ot=E.createElement("input")).value="t",ot.type="radio",y.radioValue="t"===ot.value;var ht,gt=k.expr.attrHandle;k.fn.extend({attr:function(e,t){return _(this,k.attr,e,t,1<arguments.length)},removeAttr:function(e){return this.each(function(){k.removeAttr(this,e)})}}),k.extend({attr:function(e,t,n){var r,i,o=e.nodeType;if(3!==o&&8!==o&&2!==o)return"undefined"==typeof e.getAttribute?k.prop(e,t,n):(1===o&&k.isXMLDoc(e)||(i=k.attrHooks[t.toLowerCase()]||(k.expr.match.bool.test(t)?ht:void 0)),void 0!==n?null===n?void k.removeAttr(e,t):i&&"set"in i&&void 0!==(r=i.set(e,n,t))?r:(e.setAttribute(t,n+""),n):i&&"get"in i&&null!==(r=i.get(e,t))?r:null==(r=k.find.attr(e,t))?void 0:r)},attrHooks:{type:{set:function(e,t){if(!y.radioValue&&"radio"===t&&A(e,"input")){var n=e.value;return e.setAttribute("type",t),n&&(e.value=n),t}}}},removeAttr:function(e,t){var n,r=0,i=t&&t.match(R);if(i&&1===e.nodeType)while(n=i[r++])e.removeAttribute(n)}}),ht={set:function(e,t,n){return!1===t?k.removeAttr(e,n):e.setAttribute(n,n),n}},k.each(k.expr.match.bool.source.match(/\w+/g),function(e,t){var a=gt[t]||k.find.attr;gt[t]=function(e,t,n){var r,i,o=t.toLowerCase();return n||(i=gt[o],gt[o]=r,r=null!=a(e,t,n)?o:null,gt[o]=i),r}});var vt=/^(?:input|select|textarea|button)$/i,yt=/^(?:a|area)$/i;function mt(e){return(e.match(R)||[]).join(" ")}function xt(e){return e.getAttribute&&e.getAttribute("class")||""}function bt(e){return Array.isArray(e)?e:"string"==typeof e&&e.match(R)||[]}k.fn.extend({prop:function(e,t){return _(this,k.prop,e,t,1<arguments.length)},removeProp:function(e){return this.each(function(){delete this[k.propFix[e]||e]})}}),k.extend({prop:function(e,t,n){var r,i,o=e.nodeType;if(3!==o&&8!==o&&2!==o)return 1===o&&k.isXMLDoc(e)||(t=k.propFix[t]||t,i=k.propHooks[t]),void 0!==n?i&&"set"in i&&void 0!==(r=i.set(e,n,t))?r:e[t]=n:i&&"get"in i&&null!==(r=i.get(e,t))?r:e[t]},propHooks:{tabIndex:{get:function(e){var t=k.find.attr(e,"tabindex");return t?parseInt(t,10):vt.test(e.nodeName)||yt.test(e.nodeName)&&e.href?0:-1}}},propFix:{"for":"htmlFor","class":"className"}}),y.optSelected||(k.propHooks.selected={get:function(e){var t=e.parentNode;return t&&t.parentNode&&t.parentNode.selectedIndex,null},set:function(e){var t=e.parentNode;t&&(t.selectedIndex,t.parentNode&&t.parentNode.selectedIndex)}}),k.each(["tabIndex","readOnly","maxLength","cellSpacing","cellPadding","rowSpan","colSpan","useMap","frameBorder","contentEditable"],function(){k.propFix[this.toLowerCase()]=this}),k.fn.extend({addClass:function(t){var e,n,r,i,o,a,s,u=0;if(m(t))return this.each(function(e){k(this).addClass(t.call(this,e,xt(this)))});if((e=bt(t)).length)while(n=this[u++])if(i=xt(n),r=1===n.nodeType&&" "+mt(i)+" "){a=0;while(o=e[a++])r.indexOf(" "+o+" ")<0&&(r+=o+" ");i!==(s=mt(r))&&n.setAttribute("class",s)}return this},removeClass:function(t){var e,n,r,i,o,a,s,u=0;if(m(t))return this.each(function(e){k(this).removeClass(t.call(this,e,xt(this)))});if(!arguments.length)return this.attr("class","");if((e=bt(t)).length)while(n=this[u++])if(i=xt(n),r=1===n.nodeType&&" "+mt(i)+" "){a=0;while(o=e[a++])while(-1<r.indexOf(" "+o+" "))r=r.replace(" "+o+" "," ");i!==(s=mt(r))&&n.setAttribute("class",s)}return this},toggleClass:function(i,t){var o=typeof i,a="string"===o||Array.isArray(i);return"boolean"==typeof t&&a?t?this.addClass(i):this.removeClass(i):m(i)?this.each(function(e){k(this).toggleClass(i.call(this,e,xt(this),t),t)}):this.each(function(){var e,t,n,r;if(a){t=0,n=k(this),r=bt(i);while(e=r[t++])n.hasClass(e)?n.removeClass(e):n.addClass(e)}else void 0!==i&&"boolean"!==o||((e=xt(this))&&Q.set(this,"__className__",e),this.setAttribute&&this.setAttribute("class",e||!1===i?"":Q.get(this,"__className__")||""))})},hasClass:function(e){var t,n,r=0;t=" "+e+" ";while(n=this[r++])if(1===n.nodeType&&-1<(" "+mt(xt(n))+" ").indexOf(t))return!0;return!1}});var wt=/\r/g;k.fn.extend({val:function(n){var r,e,i,t=this[0];return arguments.length?(i=m(n),this.each(function(e){var t;1===this.nodeType&&(null==(t=i?n.call(this,e,k(this).val()):n)?t="":"number"==typeof t?t+="":Array.isArray(t)&&(t=k.map(t,function(e){return null==e?"":e+""})),(r=k.valHooks[this.type]||k.valHooks[this.nodeName.toLowerCase()])&&"set"in r&&void 0!==r.set(this,t,"value")||(this.value=t))})):t?(r=k.valHooks[t.type]||k.valHooks[t.nodeName.toLowerCase()])&&"get"in r&&void 0!==(e=r.get(t,"value"))?e:"string"==typeof(e=t.value)?e.replace(wt,""):null==e?"":e:void 0}}),k.extend({valHooks:{option:{get:function(e){var t=k.find.attr(e,"value");return null!=t?t:mt(k.text(e))}},select:{get:function(e){var t,n,r,i=e.options,o=e.selectedIndex,a="select-one"===e.type,s=a?null:[],u=a?o+1:i.length;for(r=o<0?u:a?o:0;r<u;r++)if(((n=i[r]).selected||r===o)&&!n.disabled&&(!n.parentNode.disabled||!A(n.parentNode,"optgroup"))){if(t=k(n).val(),a)return t;s.push(t)}return s},set:function(e,t){var n,r,i=e.options,o=k.makeArray(t),a=i.length;while(a--)((r=i[a]).selected=-1<k.inArray(k.valHooks.option.get(r),o))&&(n=!0);return n||(e.selectedIndex=-1),o}}}}),k.each(["radio","checkbox"],function(){k.valHooks[this]={set:function(e,t){if(Array.isArray(t))return e.checked=-1<k.inArray(k(e).val(),t)}},y.checkOn||(k.valHooks[this].get=function(e){return null===e.getAttribute("value")?"on":e.value})}),y.focusin="onfocusin"in C;var Tt=/^(?:focusinfocus|focusoutblur)$/,Ct=function(e){e.stopPropagation()};k.extend(k.event,{trigger:function(e,t,n,r){var i,o,a,s,u,l,c,f,p=[n||E],d=v.call(e,"type")?e.type:e,h=v.call(e,"namespace")?e.namespace.split("."):[];if(o=f=a=n=n||E,3!==n.nodeType&&8!==n.nodeType&&!Tt.test(d+k.event.triggered)&&(-1<d.indexOf(".")&&(d=(h=d.split(".")).shift(),h.sort()),u=d.indexOf(":")<0&&"on"+d,(e=e[k.expando]?e:new k.Event(d,"object"==typeof e&&e)).isTrigger=r?2:3,e.namespace=h.join("."),e.rnamespace=e.namespace?new RegExp("(^|\\.)"+h.join("\\.(?:.*\\.|)")+"(\\.|$)"):null,e.result=void 0,e.target||(e.target=n),t=null==t?[e]:k.makeArray(t,[e]),c=k.event.special[d]||{},r||!c.trigger||!1!==c.trigger.apply(n,t))){if(!r&&!c.noBubble&&!x(n)){for(s=c.delegateType||d,Tt.test(s+d)||(o=o.parentNode);o;o=o.parentNode)p.push(o),a=o;a===(n.ownerDocument||E)&&p.push(a.defaultView||a.parentWindow||C)}i=0;while((o=p[i++])&&!e.isPropagationStopped())f=o,e.type=1<i?s:c.bindType||d,(l=(Q.get(o,"events")||{})[e.type]&&Q.get(o,"handle"))&&l.apply(o,t),(l=u&&o[u])&&l.apply&&G(o)&&(e.result=l.apply(o,t),!1===e.result&&e.preventDefault());return e.type=d,r||e.isDefaultPrevented()||c._default&&!1!==c._default.apply(p.pop(),t)||!G(n)||u&&m(n[d])&&!x(n)&&((a=n[u])&&(n[u]=null),k.event.triggered=d,e.isPropagationStopped()&&f.addEventListener(d,Ct),n[d](),e.isPropagationStopped()&&f.removeEventListener(d,Ct),k.event.triggered=void 0,a&&(n[u]=a)),e.result}},simulate:function(e,t,n){var r=k.extend(new k.Event,n,{type:e,isSimulated:!0});k.event.trigger(r,null,t)}}),k.fn.extend({trigger:function(e,t){return this.each(function(){k.event.trigger(e,t,this)})},triggerHandler:function(e,t){var n=this[0];if(n)return k.event.trigger(e,t,n,!0)}}),y.focusin||k.each({focus:"focusin",blur:"focusout"},function(n,r){var i=function(e){k.event.simulate(r,e.target,k.event.fix(e))};k.event.special[r]={setup:function(){var e=this.ownerDocument||this,t=Q.access(e,r);t||e.addEventListener(n,i,!0),Q.access(e,r,(t||0)+1)},teardown:function(){var e=this.ownerDocument||this,t=Q.access(e,r)-1;t?Q.access(e,r,t):(e.removeEventListener(n,i,!0),Q.remove(e,r))}}});var Et=C.location,kt=Date.now(),St=/\?/;k.parseXML=function(e){var t;if(!e||"string"!=typeof e)return null;try{t=(new C.DOMParser).parseFromString(e,"text/xml")}catch(e){t=void 0}return t&&!t.getElementsByTagName("parsererror").length||k.error("Invalid XML: "+e),t};var Nt=/\[\]$/,At=/\r?\n/g,Dt=/^(?:submit|button|image|reset|file)$/i,jt=/^(?:input|select|textarea|keygen)/i;function qt(n,e,r,i){var t;if(Array.isArray(e))k.each(e,function(e,t){r||Nt.test(n)?i(n,t):qt(n+"["+("object"==typeof t&&null!=t?e:"")+"]",t,r,i)});else if(r||"object"!==w(e))i(n,e);else for(t in e)qt(n+"["+t+"]",e[t],r,i)}k.param=function(e,t){var n,r=[],i=function(e,t){var n=m(t)?t():t;r[r.length]=encodeURIComponent(e)+"="+encodeURIComponent(null==n?"":n)};if(null==e)return"";if(Array.isArray(e)||e.jquery&&!k.isPlainObject(e))k.each(e,function(){i(this.name,this.value)});else for(n in e)qt(n,e[n],t,i);return r.join("&")},k.fn.extend({serialize:function(){return k.param(this.serializeArray())},serializeArray:function(){return this.map(function(){var e=k.prop(this,"elements");return e?k.makeArray(e):this}).filter(function(){var e=this.type;return this.name&&!k(this).is(":disabled")&&jt.test(this.nodeName)&&!Dt.test(e)&&(this.checked||!pe.test(e))}).map(function(e,t){var n=k(this).val();return null==n?null:Array.isArray(n)?k.map(n,function(e){return{name:t.name,value:e.replace(At,"\r\n")}}):{name:t.name,value:n.replace(At,"\r\n")}}).get()}});var Lt=/%20/g,Ht=/#.*$/,Ot=/([?&])_=[^&]*/,Pt=/^(.*?):[ \t]*([^\r\n]*)$/gm,Rt=/^(?:GET|HEAD)$/,Mt=/^\/\//,It={},Wt={},$t="*/".concat("*"),Ft=E.createElement("a");function Bt(o){return function(e,t){"string"!=typeof e&&(t=e,e="*");var n,r=0,i=e.toLowerCase().match(R)||[];if(m(t))while(n=i[r++])"+"===n[0]?(n=n.slice(1)||"*",(o[n]=o[n]||[]).unshift(t)):(o[n]=o[n]||[]).push(t)}}function _t(t,i,o,a){var s={},u=t===Wt;function l(e){var r;return s[e]=!0,k.each(t[e]||[],function(e,t){var n=t(i,o,a);return"string"!=typeof n||u||s[n]?u?!(r=n):void 0:(i.dataTypes.unshift(n),l(n),!1)}),r}return l(i.dataTypes[0])||!s["*"]&&l("*")}function zt(e,t){var n,r,i=k.ajaxSettings.flatOptions||{};for(n in t)void 0!==t[n]&&((i[n]?e:r||(r={}))[n]=t[n]);return r&&k.extend(!0,e,r),e}Ft.href=Et.href,k.extend({active:0,lastModified:{},etag:{},ajaxSettings:{url:Et.href,type:"GET",isLocal:/^(?:about|app|app-storage|.+-extension|file|res|widget):$/.test(Et.protocol),global:!0,processData:!0,async:!0,contentType:"application/x-www-form-urlencoded; charset=UTF-8",accepts:{"*":$t,text:"text/plain",html:"text/html",xml:"application/xml, text/xml",json:"application/json, text/javascript"},contents:{xml:/\bxml\b/,html:/\bhtml/,json:/\bjson\b/},responseFields:{xml:"responseXML",text:"responseText",json:"responseJSON"},converters:{"* text":String,"text html":!0,"text json":JSON.parse,"text xml":k.parseXML},flatOptions:{url:!0,context:!0}},ajaxSetup:function(e,t){return t?zt(zt(e,k.ajaxSettings),t):zt(k.ajaxSettings,e)},ajaxPrefilter:Bt(It),ajaxTransport:Bt(Wt),ajax:function(e,t){"object"==typeof e&&(t=e,e=void 0),t=t||{};var c,f,p,n,d,r,h,g,i,o,v=k.ajaxSetup({},t),y=v.context||v,m=v.context&&(y.nodeType||y.jquery)?k(y):k.event,x=k.Deferred(),b=k.Callbacks("once memory"),w=v.statusCode||{},a={},s={},u="canceled",T={readyState:0,getResponseHeader:function(e){var t;if(h){if(!n){n={};while(t=Pt.exec(p))n[t[1].toLowerCase()+" "]=(n[t[1].toLowerCase()+" "]||[]).concat(t[2])}t=n[e.toLowerCase()+" "]}return null==t?null:t.join(", ")},getAllResponseHeaders:function(){return h?p:null},setRequestHeader:function(e,t){return null==h&&(e=s[e.toLowerCase()]=s[e.toLowerCase()]||e,a[e]=t),this},overrideMimeType:function(e){return null==h&&(v.mimeType=e),this},statusCode:function(e){var t;if(e)if(h)T.always(e[T.status]);else for(t in e)w[t]=[w[t],e[t]];return this},abort:function(e){var t=e||u;return c&&c.abort(t),l(0,t),this}};if(x.promise(T),v.url=((e||v.url||Et.href)+"").replace(Mt,Et.protocol+"//"),v.type=t.method||t.type||v.method||v.type,v.dataTypes=(v.dataType||"*").toLowerCase().match(R)||[""],null==v.crossDomain){r=E.createElement("a");try{r.href=v.url,r.href=r.href,v.crossDomain=Ft.protocol+"//"+Ft.host!=r.protocol+"//"+r.host}catch(e){v.crossDomain=!0}}if(v.data&&v.processData&&"string"!=typeof v.data&&(v.data=k.param(v.data,v.traditional)),_t(It,v,t,T),h)return T;for(i in(g=k.event&&v.global)&&0==k.active++&&k.event.trigger("ajaxStart"),v.type=v.type.toUpperCase(),v.hasContent=!Rt.test(v.type),f=v.url.replace(Ht,""),v.hasContent?v.data&&v.processData&&0===(v.contentType||"").indexOf("application/x-www-form-urlencoded")&&(v.data=v.data.replace(Lt,"+")):(o=v.url.slice(f.length),v.data&&(v.processData||"string"==typeof v.data)&&(f+=(St.test(f)?"&":"?")+v.data,delete v.data),!1===v.cache&&(f=f.replace(Ot,"$1"),o=(St.test(f)?"&":"?")+"_="+kt+++o),v.url=f+o),v.ifModified&&(k.lastModified[f]&&T.setRequestHeader("If-Modified-Since",k.lastModified[f]),k.etag[f]&&T.setRequestHeader("If-None-Match",k.etag[f])),(v.data&&v.hasContent&&!1!==v.contentType||t.contentType)&&T.setRequestHeader("Content-Type",v.contentType),T.setRequestHeader("Accept",v.dataTypes[0]&&v.accepts[v.dataTypes[0]]?v.accepts[v.dataTypes[0]]+("*"!==v.dataTypes[0]?", "+$t+"; q=0.01":""):v.accepts["*"]),v.headers)T.setRequestHeader(i,v.headers[i]);if(v.beforeSend&&(!1===v.beforeSend.call(y,T,v)||h))return T.abort();if(u="abort",b.add(v.complete),T.done(v.success),T.fail(v.error),c=_t(Wt,v,t,T)){if(T.readyState=1,g&&m.trigger("ajaxSend",[T,v]),h)return T;v.async&&0<v.timeout&&(d=C.setTimeout(function(){T.abort("timeout")},v.timeout));try{h=!1,c.send(a,l)}catch(e){if(h)throw e;l(-1,e)}}else l(-1,"No Transport");function l(e,t,n,r){var i,o,a,s,u,l=t;h||(h=!0,d&&C.clearTimeout(d),c=void 0,p=r||"",T.readyState=0<e?4:0,i=200<=e&&e<300||304===e,n&&(s=function(e,t,n){var r,i,o,a,s=e.contents,u=e.dataTypes;while("*"===u[0])u.shift(),void 0===r&&(r=e.mimeType||t.getResponseHeader("Content-Type"));if(r)for(i in s)if(s[i]&&s[i].test(r)){u.unshift(i);break}if(u[0]in n)o=u[0];else{for(i in n){if(!u[0]||e.converters[i+" "+u[0]]){o=i;break}a||(a=i)}o=o||a}if(o)return o!==u[0]&&u.unshift(o),n[o]}(v,T,n)),s=function(e,t,n,r){var i,o,a,s,u,l={},c=e.dataTypes.slice();if(c[1])for(a in e.converters)l[a.toLowerCase()]=e.converters[a];o=c.shift();while(o)if(e.responseFields[o]&&(n[e.responseFields[o]]=t),!u&&r&&e.dataFilter&&(t=e.dataFilter(t,e.dataType)),u=o,o=c.shift())if("*"===o)o=u;else if("*"!==u&&u!==o){if(!(a=l[u+" "+o]||l["* "+o]))for(i in l)if((s=i.split(" "))[1]===o&&(a=l[u+" "+s[0]]||l["* "+s[0]])){!0===a?a=l[i]:!0!==l[i]&&(o=s[0],c.unshift(s[1]));break}if(!0!==a)if(a&&e["throws"])t=a(t);else try{t=a(t)}catch(e){return{state:"parsererror",error:a?e:"No conversion from "+u+" to "+o}}}return{state:"success",data:t}}(v,s,T,i),i?(v.ifModified&&((u=T.getResponseHeader("Last-Modified"))&&(k.lastModified[f]=u),(u=T.getResponseHeader("etag"))&&(k.etag[f]=u)),204===e||"HEAD"===v.type?l="nocontent":304===e?l="notmodified":(l=s.state,o=s.data,i=!(a=s.error))):(a=l,!e&&l||(l="error",e<0&&(e=0))),T.status=e,T.statusText=(t||l)+"",i?x.resolveWith(y,[o,l,T]):x.rejectWith(y,[T,l,a]),T.statusCode(w),w=void 0,g&&m.trigger(i?"ajaxSuccess":"ajaxError",[T,v,i?o:a]),b.fireWith(y,[T,l]),g&&(m.trigger("ajaxComplete",[T,v]),--k.active||k.event.trigger("ajaxStop")))}return T},getJSON:function(e,t,n){return k.get(e,t,n,"json")},getScript:function(e,t){return k.get(e,void 0,t,"script")}}),k.each(["get","post"],function(e,i){k[i]=function(e,t,n,r){return m(t)&&(r=r||n,n=t,t=void 0),k.ajax(k.extend({url:e,type:i,dataType:r,data:t,success:n},k.isPlainObject(e)&&e))}}),k._evalUrl=function(e,t){return k.ajax({url:e,type:"GET",dataType:"script",cache:!0,async:!1,global:!1,converters:{"text script":function(){}},dataFilter:function(e){k.globalEval(e,t)}})},k.fn.extend({wrapAll:function(e){var t;return this[0]&&(m(e)&&(e=e.call(this[0])),t=k(e,this[0].ownerDocument).eq(0).clone(!0),this[0].parentNode&&t.insertBefore(this[0]),t.map(function(){var e=this;while(e.firstElementChild)e=e.firstElementChild;return e}).append(this)),this},wrapInner:function(n){return m(n)?this.each(function(e){k(this).wrapInner(n.call(this,e))}):this.each(function(){var e=k(this),t=e.contents();t.length?t.wrapAll(n):e.append(n)})},wrap:function(t){var n=m(t);return this.each(function(e){k(this).wrapAll(n?t.call(this,e):t)})},unwrap:function(e){return this.parent(e).not("body").each(function(){k(this).replaceWith(this.childNodes)}),this}}),k.expr.pseudos.hidden=function(e){return!k.expr.pseudos.visible(e)},k.expr.pseudos.visible=function(e){return!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length)},k.ajaxSettings.xhr=function(){try{return new C.XMLHttpRequest}catch(e){}};var Ut={0:200,1223:204},Xt=k.ajaxSettings.xhr();y.cors=!!Xt&&"withCredentials"in Xt,y.ajax=Xt=!!Xt,k.ajaxTransport(function(i){var o,a;if(y.cors||Xt&&!i.crossDomain)return{send:function(e,t){var n,r=i.xhr();if(r.open(i.type,i.url,i.async,i.username,i.password),i.xhrFields)for(n in i.xhrFields)r[n]=i.xhrFields[n];for(n in i.mimeType&&r.overrideMimeType&&r.overrideMimeType(i.mimeType),i.crossDomain||e["X-Requested-With"]||(e["X-Requested-With"]="XMLHttpRequest"),e)r.setRequestHeader(n,e[n]);o=function(e){return function(){o&&(o=a=r.onload=r.onerror=r.onabort=r.ontimeout=r.onreadystatechange=null,"abort"===e?r.abort():"error"===e?"number"!=typeof r.status?t(0,"error"):t(r.status,r.statusText):t(Ut[r.status]||r.status,r.statusText,"text"!==(r.responseType||"text")||"string"!=typeof r.responseText?{binary:r.response}:{text:r.responseText},r.getAllResponseHeaders()))}},r.onload=o(),a=r.onerror=r.ontimeout=o("error"),void 0!==r.onabort?r.onabort=a:r.onreadystatechange=function(){4===r.readyState&&C.setTimeout(function(){o&&a()})},o=o("abort");try{r.send(i.hasContent&&i.data||null)}catch(e){if(o)throw e}},abort:function(){o&&o()}}}),k.ajaxPrefilter(function(e){e.crossDomain&&(e.contents.script=!1)}),k.ajaxSetup({accepts:{script:"text/javascript, application/javascript, application/ecmascript, application/x-ecmascript"},contents:{script:/\b(?:java|ecma)script\b/},converters:{"text script":function(e){return k.globalEval(e),e}}}),k.ajaxPrefilter("script",function(e){void 0===e.cache&&(e.cache=!1),e.crossDomain&&(e.type="GET")}),k.ajaxTransport("script",function(n){var r,i;if(n.crossDomain||n.scriptAttrs)return{send:function(e,t){r=k("<script>").attr(n.scriptAttrs||{}).prop({charset:n.scriptCharset,src:n.url}).on("load error",i=function(e){r.remove(),i=null,e&&t("error"===e.type?404:200,e.type)}),E.head.appendChild(r[0])},abort:function(){i&&i()}}});var Vt,Gt=[],Yt=/(=)\?(?=&|$)|\?\?/;k.ajaxSetup({jsonp:"callback",jsonpCallback:function(){var e=Gt.pop()||k.expando+"_"+kt++;return this[e]=!0,e}}),k.ajaxPrefilter("json jsonp",function(e,t,n){var r,i,o,a=!1!==e.jsonp&&(Yt.test(e.url)?"url":"string"==typeof e.data&&0===(e.contentType||"").indexOf("application/x-www-form-urlencoded")&&Yt.test(e.data)&&"data");if(a||"jsonp"===e.dataTypes[0])return r=e.jsonpCallback=m(e.jsonpCallback)?e.jsonpCallback():e.jsonpCallback,a?e[a]=e[a].replace(Yt,"$1"+r):!1!==e.jsonp&&(e.url+=(St.test(e.url)?"&":"?")+e.jsonp+"="+r),e.converters["script json"]=function(){return o||k.error(r+" was not called"),o[0]},e.dataTypes[0]="json",i=C[r],C[r]=function(){o=arguments},n.always(function(){void 0===i?k(C).removeProp(r):C[r]=i,e[r]&&(e.jsonpCallback=t.jsonpCallback,Gt.push(r)),o&&m(i)&&i(o[0]),o=i=void 0}),"script"}),y.createHTMLDocument=((Vt=E.implementation.createHTMLDocument("").body).innerHTML="<form></form><form></form>",2===Vt.childNodes.length),k.parseHTML=function(e,t,n){return"string"!=typeof e?[]:("boolean"==typeof t&&(n=t,t=!1),t||(y.createHTMLDocument?((r=(t=E.implementation.createHTMLDocument("")).createElement("base")).href=E.location.href,t.head.appendChild(r)):t=E),o=!n&&[],(i=D.exec(e))?[t.createElement(i[1])]:(i=we([e],t,o),o&&o.length&&k(o).remove(),k.merge([],i.childNodes)));var r,i,o},k.fn.load=function(e,t,n){var r,i,o,a=this,s=e.indexOf(" ");return-1<s&&(r=mt(e.slice(s)),e=e.slice(0,s)),m(t)?(n=t,t=void 0):t&&"object"==typeof t&&(i="POST"),0<a.length&&k.ajax({url:e,type:i||"GET",dataType:"html",data:t}).done(function(e){o=arguments,a.html(r?k("<div>").append(k.parseHTML(e)).find(r):e)}).always(n&&function(e,t){a.each(function(){n.apply(this,o||[e.responseText,t,e])})}),this},k.each(["ajaxStart","ajaxStop","ajaxComplete","ajaxError","ajaxSuccess","ajaxSend"],function(e,t){k.fn[t]=function(e){return this.on(t,e)}}),k.expr.pseudos.animated=function(t){return k.grep(k.timers,function(e){return t===e.elem}).length},k.offset={setOffset:function(e,t,n){var r,i,o,a,s,u,l=k.css(e,"position"),c=k(e),f={};"static"===l&&(e.style.position="relative"),s=c.offset(),o=k.css(e,"top"),u=k.css(e,"left"),("absolute"===l||"fixed"===l)&&-1<(o+u).indexOf("auto")?(a=(r=c.position()).top,i=r.left):(a=parseFloat(o)||0,i=parseFloat(u)||0),m(t)&&(t=t.call(e,n,k.extend({},s))),null!=t.top&&(f.top=t.top-s.top+a),null!=t.left&&(f.left=t.left-s.left+i),"using"in t?t.using.call(e,f):c.css(f)}},k.fn.extend({offset:function(t){if(arguments.length)return void 0===t?this:this.each(function(e){k.offset.setOffset(this,t,e)});var e,n,r=this[0];return r?r.getClientRects().length?(e=r.getBoundingClientRect(),n=r.ownerDocument.defaultView,{top:e.top+n.pageYOffset,left:e.left+n.pageXOffset}):{top:0,left:0}:void 0},position:function(){if(this[0]){var e,t,n,r=this[0],i={top:0,left:0};if("fixed"===k.css(r,"position"))t=r.getBoundingClientRect();else{t=this.offset(),n=r.ownerDocument,e=r.offsetParent||n.documentElement;while(e&&(e===n.body||e===n.documentElement)&&"static"===k.css(e,"position"))e=e.parentNode;e&&e!==r&&1===e.nodeType&&((i=k(e).offset()).top+=k.css(e,"borderTopWidth",!0),i.left+=k.css(e,"borderLeftWidth",!0))}return{top:t.top-i.top-k.css(r,"marginTop",!0),left:t.left-i.left-k.css(r,"marginLeft",!0)}}},offsetParent:function(){return this.map(function(){var e=this.offsetParent;while(e&&"static"===k.css(e,"position"))e=e.offsetParent;return e||ie})}}),k.each({scrollLeft:"pageXOffset",scrollTop:"pageYOffset"},function(t,i){var o="pageYOffset"===i;k.fn[t]=function(e){return _(this,function(e,t,n){var r;if(x(e)?r=e:9===e.nodeType&&(r=e.defaultView),void 0===n)return r?r[i]:e[t];r?r.scrollTo(o?r.pageXOffset:n,o?n:r.pageYOffset):e[t]=n},t,e,arguments.length)}}),k.each(["top","left"],function(e,n){k.cssHooks[n]=ze(y.pixelPosition,function(e,t){if(t)return t=_e(e,n),$e.test(t)?k(e).position()[n]+"px":t})}),k.each({Height:"height",Width:"width"},function(a,s){k.each({padding:"inner"+a,content:s,"":"outer"+a},function(r,o){k.fn[o]=function(e,t){var n=arguments.length&&(r||"boolean"!=typeof e),i=r||(!0===e||!0===t?"margin":"border");return _(this,function(e,t,n){var r;return x(e)?0===o.indexOf("outer")?e["inner"+a]:e.document.documentElement["client"+a]:9===e.nodeType?(r=e.documentElement,Math.max(e.body["scroll"+a],r["scroll"+a],e.body["offset"+a],r["offset"+a],r["client"+a])):void 0===n?k.css(e,t,i):k.style(e,t,n,i)},s,n?e:void 0,n)}})}),k.each("blur focus focusin focusout resize scroll click dblclick mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave change select submit keydown keypress keyup contextmenu".split(" "),function(e,n){k.fn[n]=function(e,t){return 0<arguments.length?this.on(n,null,e,t):this.trigger(n)}}),k.fn.extend({hover:function(e,t){return this.mouseenter(e).mouseleave(t||e)}}),k.fn.extend({bind:function(e,t,n){return this.on(e,null,t,n)},unbind:function(e,t){return this.off(e,null,t)},delegate:function(e,t,n,r){return this.on(t,e,n,r)},undelegate:function(e,t,n){return 1===arguments.length?this.off(e,"**"):this.off(t,e||"**",n)}}),k.proxy=function(e,t){var n,r,i;if("string"==typeof t&&(n=e[t],t=e,e=n),m(e))return r=s.call(arguments,2),(i=function(){return e.apply(t||this,r.concat(s.call(arguments)))}).guid=e.guid=e.guid||k.guid++,i},k.holdReady=function(e){e?k.readyWait++:k.ready(!0)},k.isArray=Array.isArray,k.parseJSON=JSON.parse,k.nodeName=A,k.isFunction=m,k.isWindow=x,k.camelCase=V,k.type=w,k.now=Date.now,k.isNumeric=function(e){var t=k.type(e);return("number"===t||"string"===t)&&!isNaN(e-parseFloat(e))},"function"==typeof define&&define.amd&&define("jquery",[],function(){return k});var Qt=C.jQuery,Jt=C.$;return k.noConflict=function(e){return C.$===k&&(C.$=Jt),e&&C.jQuery===k&&(C.jQuery=Qt),k},e||(C.jQuery=C.$=k),k});

!function(){"use strict";if("undefined"!=typeof window){var t=window.navigator.userAgent.match(/Edge\/(\d{2})\./),n=!!t&&16<=parseInt(t[1],10);if(!("objectFit"in document.documentElement.style!=!1)||n){var o=function(t,e,i){var n,o,l,a,d;if((i=i.split(" ")).length<2&&(i[1]=i[0]),"x"===t)n=i[0],o=i[1],l="left",a="right",d=e.clientWidth;else{if("y"!==t)return;n=i[1],o=i[0],l="top",a="bottom",d=e.clientHeight}if(n!==l&&o!==l){if(n!==a&&o!==a)return"center"===n||"50%"===n?(e.style[l]="50%",void(e.style["margin-"+l]=d/-2+"px")):void(0<=n.indexOf("%")?(n=parseInt(n))<50?(e.style[l]=n+"%",e.style["margin-"+l]=d*(n/-100)+"px"):(n=100-n,e.style[a]=n+"%",e.style["margin-"+a]=d*(n/-100)+"px"):e.style[l]=n);e.style[a]="0"}else e.style[l]="0"},l=function(t){var e=t.dataset?t.dataset.objectFit:t.getAttribute("data-object-fit"),i=t.dataset?t.dataset.objectPosition:t.getAttribute("data-object-position");e=e||"cover",i=i||"50% 50%";var n=t.parentNode;return function(t){var e=window.getComputedStyle(t,null),i=e.getPropertyValue("position"),n=e.getPropertyValue("overflow"),o=e.getPropertyValue("display");i&&"static"!==i||(t.style.position="relative"),"hidden"!==n&&(t.style.overflow="hidden"),o&&"inline"!==o||(t.style.display="block"),0===t.clientHeight&&(t.style.height="100%"),-1===t.className.indexOf("object-fit-polyfill")&&(t.className=t.className+" object-fit-polyfill")}(n),function(t){var e=window.getComputedStyle(t,null),i={"max-width":"none","max-height":"none","min-width":"0px","min-height":"0px",top:"auto",right:"auto",bottom:"auto",left:"auto","margin-top":"0px","margin-right":"0px","margin-bottom":"0px","margin-left":"0px"};for(var n in i)e.getPropertyValue(n)!==i[n]&&(t.style[n]=i[n])}(t),t.style.position="absolute",t.style.width="auto",t.style.height="auto","scale-down"===e&&(e=t.clientWidth<n.clientWidth&&t.clientHeight<n.clientHeight?"none":"contain"),"none"===e?(o("x",t,i),void o("y",t,i)):"fill"===e?(t.style.width="100%",t.style.height="100%",o("x",t,i),void o("y",t,i)):(t.style.height="100%",void("cover"===e&&t.clientWidth>n.clientWidth||"contain"===e&&t.clientWidth<n.clientWidth?(t.style.top="0",t.style.marginTop="0",o("x",t,i)):(t.style.width="100%",t.style.height="auto",t.style.left="0",t.style.marginLeft="0",o("y",t,i))))},e=function(t){if(void 0===t||t instanceof Event)t=document.querySelectorAll("[data-object-fit]");else if(t&&t.nodeName)t=[t];else{if("object"!=typeof t||!t.length||!t[0].nodeName)return!1;t=t}for(var e=0;e<t.length;e++)if(t[e].nodeName){var i=t[e].nodeName.toLowerCase();if("img"===i){if(n)continue;t[e].complete?l(t[e]):t[e].addEventListener("load",function(){l(this)})}else"video"===i?0<t[e].readyState?l(t[e]):t[e].addEventListener("loadedmetadata",function(){l(this)}):l(t[e])}return!0};"loading"===document.readyState?document.addEventListener("DOMContentLoaded",e):e(),window.addEventListener("resize",e),window.objectFitPolyfill=e}else window.objectFitPolyfill=function(){return!1}}}();
!function r(c,a,f){function o(n,t){if(!a[n]){if(!c[n]){var e="function"==typeof require&&require;if(!t&&e)return e(n,!0);if(s)return s(n,!0);var i=new Error("Cannot find module '"+n+"'");throw i.code="MODULE_NOT_FOUND",i}var u=a[n]={exports:{}};c[n][0].call(u.exports,function(t){return o(c[n][1][t]||t)},u,u.exports,r,c,a,f)}return a[n].exports}for(var s="function"==typeof require&&require,t=0;t<f.length;t++)o(f[t]);return o}({1:[function(t,n,r){"use strict";t(2);var e=function _interopRequireDefault(t){return t&&t.__esModule?t:{default:t}}(t(15));e.default._babelPolyfill&&"undefined"!=typeof console&&console.warn&&console.warn("@babel/polyfill is loaded more than once on this page. This is probably not desirable/intended and may have consequences if different versions of the polyfills are applied sequentially. If you do need to load the polyfill more than once, use @babel/polyfill/noConflict instead to bypass the warning."),e.default._babelPolyfill=!0},{15:15,2:2}],2:[function(t,n,r){"use strict";t(3),t(5),t(4),t(11),t(10),t(13),t(12),t(14),t(7),t(8),t(6),t(9),t(306),t(307)},{10:10,11:11,12:12,13:13,14:14,3:3,306:306,307:307,4:4,5:5,6:6,7:7,8:8,9:9}],3:[function(t,n,r){t(278),t(214),t(216),t(215),t(218),t(220),t(225),t(219),t(217),t(227),t(226),t(222),t(223),t(221),t(213),t(224),t(228),t(229),t(180),t(182),t(181),t(231),t(230),t(201),t(211),t(212),t(202),t(203),t(204),t(205),t(206),t(207),t(208),t(209),t(210),t(184),t(185),t(186),t(187),t(188),t(189),t(190),t(191),t(192),t(193),t(194),t(195),t(196),t(197),t(198),t(199),t(200),t(265),t(270),t(277),t(268),t(260),t(261),t(266),t(271),t(273),t(256),t(257),t(258),t(259),t(262),t(263),t(264),t(267),t(269),t(272),t(274),t(275),t(276),t(175),t(177),t(176),t(179),t(178),t(163),t(161),t(168),t(165),t(171),t(173),t(160),t(167),t(157),t(172),t(155),t(170),t(169),t(162),t(166),t(154),t(156),t(159),t(158),t(174),t(164),t(247),t(248),t(254),t(249),t(250),t(251),t(252),t(253),t(232),t(183),t(255),t(290),t(291),t(279),t(280),t(285),t(288),t(289),t(283),t(286),t(284),t(287),t(281),t(282),t(233),t(234),t(235),t(236),t(237),t(240),t(238),t(239),t(241),t(242),t(243),t(244),t(246),t(245),n.exports=t(52)},{154:154,155:155,156:156,157:157,158:158,159:159,160:160,161:161,162:162,163:163,164:164,165:165,166:166,167:167,168:168,169:169,170:170,171:171,172:172,173:173,174:174,175:175,176:176,177:177,178:178,179:179,180:180,181:181,182:182,183:183,184:184,185:185,186:186,187:187,188:188,189:189,190:190,191:191,192:192,193:193,194:194,195:195,196:196,197:197,198:198,199:199,200:200,201:201,202:202,203:203,204:204,205:205,206:206,207:207,208:208,209:209,210:210,211:211,212:212,213:213,214:214,215:215,216:216,217:217,218:218,219:219,220:220,221:221,222:222,223:223,224:224,225:225,226:226,227:227,228:228,229:229,230:230,231:231,232:232,233:233,234:234,235:235,236:236,237:237,238:238,239:239,240:240,241:241,242:242,243:243,244:244,245:245,246:246,247:247,248:248,249:249,250:250,251:251,252:252,253:253,254:254,255:255,256:256,257:257,258:258,259:259,260:260,261:261,262:262,263:263,264:264,265:265,266:266,267:267,268:268,269:269,270:270,271:271,272:272,273:273,274:274,275:275,276:276,277:277,278:278,279:279,280:280,281:281,282:282,283:283,284:284,285:285,286:286,287:287,288:288,289:289,290:290,291:291,52:52}],4:[function(t,n,r){t(292),n.exports=t(52).Array.flatMap},{292:292,52:52}],5:[function(t,n,r){t(293),n.exports=t(52).Array.includes},{293:293,52:52}],6:[function(t,n,r){t(294),n.exports=t(52).Object.entries},{294:294,52:52}],7:[function(t,n,r){t(295),n.exports=t(52).Object.getOwnPropertyDescriptors},{295:295,52:52}],8:[function(t,n,r){t(296),n.exports=t(52).Object.values},{296:296,52:52}],9:[function(t,n,r){"use strict";t(232),t(297),n.exports=t(52).Promise.finally},{232:232,297:297,52:52}],10:[function(t,n,r){t(298),n.exports=t(52).String.padEnd},{298:298,52:52}],11:[function(t,n,r){t(299),n.exports=t(52).String.padStart},{299:299,52:52}],12:[function(t,n,r){t(301),n.exports=t(52).String.trimRight},{301:301,52:52}],13:[function(t,n,r){t(300),n.exports=t(52).String.trimLeft},{300:300,52:52}],14:[function(t,n,r){t(302),n.exports=t(151).f("asyncIterator")},{151:151,302:302}],15:[function(t,n,r){t(32),n.exports=t(18).global},{18:18,32:32}],16:[function(t,n,r){n.exports=function(t){if("function"!=typeof t)throw TypeError(t+" is not a function!");return t}},{}],17:[function(t,n,r){var e=t(28);n.exports=function(t){if(!e(t))throw TypeError(t+" is not an object!");return t}},{28:28}],18:[function(t,n,r){var e=n.exports={version:"2.6.11"};"number"==typeof __e&&(__e=e)},{}],19:[function(t,n,r){var o=t(16);n.exports=function(e,i,t){if(o(e),void 0===i)return e;switch(t){case 1:return function(t){return e.call(i,t)};case 2:return function(t,n){return e.call(i,t,n)};case 3:return function(t,n,r){return e.call(i,t,n,r)}}return function(){return e.apply(i,arguments)}}},{16:16}],20:[function(t,n,r){n.exports=!t(23)(function(){return 7!=Object.defineProperty({},"a",{get:function(){return 7}}).a})},{23:23}],21:[function(t,n,r){var e=t(28),i=t(24).document,o=e(i)&&e(i.createElement);n.exports=function(t){return o?i.createElement(t):{}}},{24:24,28:28}],22:[function(t,n,r){var g=t(24),y=t(18),d=t(19),x=t(26),m=t(25),S="prototype",b=function(t,n,r){var e,i,o,u=t&b.F,c=t&b.G,a=t&b.S,f=t&b.P,s=t&b.B,l=t&b.W,h=c?y:y[n]||(y[n]={}),p=h[S],v=c?g:a?g[n]:(g[n]||{})[S];for(e in c&&(r=n),r)(i=!u&&v&&void 0!==v[e])&&m(h,e)||(o=i?v[e]:r[e],h[e]=c&&"function"!=typeof v[e]?r[e]:s&&i?d(o,g):l&&v[e]==o?function(e){function qb(t,n,r){if(this instanceof e){switch(arguments.length){case 0:return new e;case 1:return new e(t);case 2:return new e(t,n)}return new e(t,n,r)}return e.apply(this,arguments)}return qb[S]=e[S],qb}(o):f&&"function"==typeof o?d(Function.call,o):o,f&&((h.virtual||(h.virtual={}))[e]=o,t&b.R&&p&&!p[e]&&x(p,e,o)))};b.F=1,b.G=2,b.S=4,b.P=8,b.B=16,b.W=32,b.U=64,b.R=128,n.exports=b},{18:18,19:19,24:24,25:25,26:26}],23:[function(t,n,r){n.exports=function(t){try{return!!t()}catch(t){return!0}}},{}],24:[function(t,n,r){var e=n.exports="undefined"!=typeof window&&window.Math==Math?window:"undefined"!=typeof self&&self.Math==Math?self:Function("return this")();"number"==typeof __g&&(__g=e)},{}],25:[function(t,n,r){var e={}.hasOwnProperty;n.exports=function(t,n){return e.call(t,n)}},{}],26:[function(t,n,r){var e=t(29),i=t(30);n.exports=t(20)?function(t,n,r){return e.f(t,n,i(1,r))}:function(t,n,r){return t[n]=r,t}},{20:20,29:29,30:30}],27:[function(t,n,r){n.exports=!t(20)&&!t(23)(function(){return 7!=Object.defineProperty(t(21)("div"),"a",{get:function(){return 7}}).a})},{20:20,21:21,23:23}],28:[function(t,n,r){n.exports=function(t){return"object"==typeof t?null!==t:"function"==typeof t}},{}],29:[function(t,n,r){var e=t(17),i=t(27),o=t(31),u=Object.defineProperty;r.f=t(20)?Object.defineProperty:function defineProperty(t,n,r){if(e(t),n=o(n,!0),e(r),i)try{return u(t,n,r)}catch(t){}if("get"in r||"set"in r)throw TypeError("Accessors not supported!");return"value"in r&&(t[n]=r.value),t}},{17:17,20:20,27:27,31:31}],30:[function(t,n,r){n.exports=function(t,n){return{enumerable:!(1&t),configurable:!(2&t),writable:!(4&t),value:n}}},{}],31:[function(t,n,r){var i=t(28);n.exports=function(t,n){if(!i(t))return t;var r,e;if(n&&"function"==typeof(r=t.toString)&&!i(e=r.call(t)))return e;if("function"==typeof(r=t.valueOf)&&!i(e=r.call(t)))return e;if(!n&&"function"==typeof(r=t.toString)&&!i(e=r.call(t)))return e;throw TypeError("Can't convert object to primitive value")}},{28:28}],32:[function(t,n,r){var e=t(22);e(e.G,{global:t(24)})},{22:22,24:24}],33:[function(t,n,r){arguments[4][16][0].apply(r,arguments)},{16:16}],34:[function(t,n,r){var e=t(48);n.exports=function(t,n){if("number"!=typeof t&&"Number"!=e(t))throw TypeError(n);return+t}},{48:48}],35:[function(t,n,r){var e=t(152)("unscopables"),i=Array.prototype;null==i[e]&&t(72)(i,e,{}),n.exports=function(t){i[e][t]=!0}},{152:152,72:72}],36:[function(t,n,r){"use strict";var e=t(129)(!0);n.exports=function(t,n,r){return n+(r?e(t,n).length:1)}},{129:129}],37:[function(t,n,r){n.exports=function(t,n,r,e){if(!(t instanceof n)||void 0!==e&&e in t)throw TypeError(r+": incorrect invocation!");return t}},{}],38:[function(t,n,r){arguments[4][17][0].apply(r,arguments)},{17:17,81:81}],39:[function(t,n,r){"use strict";var f=t(142),s=t(137),l=t(141);n.exports=[].copyWithin||function copyWithin(t,n){var r=f(this),e=l(r.length),i=s(t,e),o=s(n,e),u=2<arguments.length?arguments[2]:void 0,c=Math.min((void 0===u?e:s(u,e))-o,e-i),a=1;for(o<i&&i<o+c&&(a=-1,o+=c-1,i+=c-1);0<c--;)o in r?r[i]=r[o]:delete r[i],i+=a,o+=a;return r}},{137:137,141:141,142:142}],40:[function(t,n,r){"use strict";var c=t(142),a=t(137),f=t(141);n.exports=function fill(t){for(var n=c(this),r=f(n.length),e=arguments.length,i=a(1<e?arguments[1]:void 0,r),o=2<e?arguments[2]:void 0,u=void 0===o?r:a(o,r);i<u;)n[i++]=t;return n}},{137:137,141:141,142:142}],41:[function(t,n,r){var a=t(140),f=t(141),s=t(137);n.exports=function(c){return function(t,n,r){var e,i=a(t),o=f(i.length),u=s(r,o);if(c&&n!=n){for(;u<o;)if((e=i[u++])!=e)return!0}else for(;u<o;u++)if((c||u in i)&&i[u]===n)return c||u||0;return!c&&-1}}},{137:137,140:140,141:141}],42:[function(t,n,r){var m=t(54),S=t(77),b=t(142),w=t(141),e=t(45);n.exports=function(l,t){var h=1==l,p=2==l,v=3==l,g=4==l,y=6==l,d=5==l||y,x=t||e;return function(t,n,r){for(var e,i,o=b(t),u=S(o),c=m(n,r,3),a=w(u.length),f=0,s=h?x(t,a):p?x(t,0):void 0;f<a;f++)if((d||f in u)&&(i=c(e=u[f],f,o),l))if(h)s[f]=i;else if(i)switch(l){case 3:return!0;case 5:return e;case 6:return f;case 2:s.push(e)}else if(g)return!1;return y?-1:v||g?g:s}}},{141:141,142:142,45:45,54:54,77:77}],43:[function(t,n,r){var s=t(33),l=t(142),h=t(77),p=t(141);n.exports=function(t,n,r,e,i){s(n);var o=l(t),u=h(o),c=p(o.length),a=i?c-1:0,f=i?-1:1;if(r<2)for(;;){if(a in u){e=u[a],a+=f;break}if(a+=f,i?a<0:c<=a)throw TypeError("Reduce of empty array with no initial value")}for(;i?0<=a:a<c;a+=f)a in u&&(e=n(e,u[a],a,o));return e}},{141:141,142:142,33:33,77:77}],44:[function(t,n,r){var e=t(81),i=t(79),o=t(152)("species");n.exports=function(t){var n;return i(t)&&("function"!=typeof(n=t.constructor)||n!==Array&&!i(n.prototype)||(n=void 0),e(n)&&null===(n=n[o])&&(n=void 0)),void 0===n?Array:n}},{152:152,79:79,81:81}],45:[function(t,n,r){var e=t(44);n.exports=function(t,n){return new(e(t))(n)}},{44:44}],46:[function(t,n,r){"use strict";var o=t(33),u=t(81),c=t(76),a=[].slice,f={};n.exports=Function.bind||function bind(n){var r=o(this),e=a.call(arguments,1),i=function(){var t=e.concat(a.call(arguments));return this instanceof i?function(t,n,r){if(!(n in f)){for(var e=[],i=0;i<n;i++)e[i]="a["+i+"]";f[n]=Function("F,a","return new F("+e.join(",")+")")}return f[n](t,r)}(r,t.length,t):c(r,t,n)};return u(r.prototype)&&(i.prototype=r.prototype),i}},{33:33,76:76,81:81}],47:[function(t,n,r){var i=t(48),o=t(152)("toStringTag"),u="Arguments"==i(function(){return arguments}());n.exports=function(t){var n,r,e;return void 0===t?"Undefined":null===t?"Null":"string"==typeof(r=function(t,n){try{return t[n]}catch(t){}}(n=Object(t),o))?r:u?i(n):"Object"==(e=i(n))&&"function"==typeof n.callee?"Arguments":e}},{152:152,48:48}],48:[function(t,n,r){var e={}.toString;n.exports=function(t){return e.call(t).slice(8,-1)}},{}],49:[function(t,n,r){"use strict";function ag(t,n){var r,e=p(n);if("F"!==e)return t._i[e];for(r=t._f;r;r=r.n)if(r.k==n)return r}var u=t(99).f,c=t(98),a=t(117),f=t(54),s=t(37),l=t(68),e=t(85),i=t(87),o=t(123),h=t(58),p=t(94).fastKey,v=t(149),g=h?"_s":"size";n.exports={getConstructor:function(t,o,r,e){var i=t(function(t,n){s(t,i,o,"_i"),t._t=o,t._i=c(null),t._f=void 0,t._l=void 0,t[g]=0,null!=n&&l(n,r,t[e],t)});return a(i.prototype,{clear:function clear(){for(var t=v(this,o),n=t._i,r=t._f;r;r=r.n)r.r=!0,r.p&&(r.p=r.p.n=void 0),delete n[r.i];t._f=t._l=void 0,t[g]=0},delete:function(t){var n=v(this,o),r=ag(n,t);if(r){var e=r.n,i=r.p;delete n._i[r.i],r.r=!0,i&&(i.n=e),e&&(e.p=i),n._f==r&&(n._f=e),n._l==r&&(n._l=i),n[g]--}return!!r},forEach:function forEach(t){v(this,o);for(var n,r=f(t,1<arguments.length?arguments[1]:void 0,3);n=n?n.n:this._f;)for(r(n.v,n.k,this);n&&n.r;)n=n.p},has:function has(t){return!!ag(v(this,o),t)}}),h&&u(i.prototype,"size",{get:function(){return v(this,o)[g]}}),i},def:function(t,n,r){var e,i,o=ag(t,n);return o?o.v=r:(t._l=o={i:i=p(n,!0),k:n,v:r,p:e=t._l,n:void 0,r:!1},t._f||(t._f=o),e&&(e.n=o),t[g]++,"F"!==i&&(t._i[i]=o)),t},getEntry:ag,setStrong:function(t,r,n){e(t,r,function(t,n){this._t=v(t,r),this._k=n,this._l=void 0},function(){for(var t=this,n=t._k,r=t._l;r&&r.r;)r=r.p;return t._t&&(t._l=r=r?r.n:t._t._f)?i(0,"keys"==n?r.k:"values"==n?r.v:[r.k,r.v]):(t._t=void 0,i(1))},n?"entries":"values",!n,!0),o(r)}}},{117:117,123:123,149:149,37:37,54:54,58:58,68:68,85:85,87:87,94:94,98:98,99:99}],50:[function(t,n,r){"use strict";function _g(t){return t._l||(t._l=new g)}function bh(t,n){return o(t.a,function(t){return t[0]===n})}var u=t(117),c=t(94).getWeak,i=t(38),a=t(81),f=t(37),s=t(68),e=t(42),l=t(71),h=t(149),o=e(5),p=e(6),v=0,g=function(){this.a=[]};g.prototype={get:function(t){var n=bh(this,t);if(n)return n[1]},has:function(t){return!!bh(this,t)},set:function(t,n){var r=bh(this,t);r?r[1]=n:this.a.push([t,n])},delete:function(n){var t=p(this.a,function(t){return t[0]===n});return~t&&this.a.splice(t,1),!!~t}},n.exports={getConstructor:function(t,r,e,i){var o=t(function(t,n){f(t,o,r,"_i"),t._t=r,t._i=v++,t._l=void 0,null!=n&&s(n,e,t[i],t)});return u(o.prototype,{delete:function(t){if(!a(t))return!1;var n=c(t);return!0===n?_g(h(this,r)).delete(t):n&&l(n,this._i)&&delete n[this._i]},has:function has(t){if(!a(t))return!1;var n=c(t);return!0===n?_g(h(this,r)).has(t):n&&l(n,this._i)}}),o},def:function(t,n,r){var e=c(i(n),!0);return!0===e?_g(t).set(n,r):e[t._i]=r,t},ufstore:_g}},{117:117,149:149,37:37,38:38,42:42,68:68,71:71,81:81,94:94}],51:[function(t,n,r){"use strict";var y=t(70),d=t(62),x=t(118),m=t(117),S=t(94),b=t(68),w=t(37),_=t(81),E=t(64),O=t(86),F=t(124),I=t(75);n.exports=function(e,t,n,r,i,o){function ci(t){var r=f[t];x(f,t,"delete"==t?function(t){return!(o&&!_(t))&&r.call(this,0===t?0:t)}:"has"==t?function has(t){return!(o&&!_(t))&&r.call(this,0===t?0:t)}:"get"==t?function get(t){return o&&!_(t)?void 0:r.call(this,0===t?0:t)}:"add"==t?function add(t){return r.call(this,0===t?0:t),this}:function set(t,n){return r.call(this,0===t?0:t,n),this})}var u=y[e],c=u,a=i?"set":"add",f=c&&c.prototype,s={};if("function"==typeof c&&(o||f.forEach&&!E(function(){(new c).entries().next()}))){var l=new c,h=l[a](o?{}:-0,1)!=l,p=E(function(){l.has(1)}),v=O(function(t){new c(t)}),g=!o&&E(function(){for(var t=new c,n=5;n--;)t[a](n,n);return!t.has(-0)});v||(((c=t(function(t,n){w(t,c,e);var r=I(new u,t,c);return null!=n&&b(n,i,r[a],r),r})).prototype=f).constructor=c),(p||g)&&(ci("delete"),ci("has"),i&&ci("get")),(g||h)&&ci(a),o&&f.clear&&delete f.clear}else c=r.getConstructor(t,e,i,a),m(c.prototype,n),S.NEED=!0;return F(c,e),s[e]=c,d(d.G+d.W+d.F*(c!=u),s),o||r.setStrong(c,e,i),c}},{117:117,118:118,124:124,37:37,62:62,64:64,68:68,70:70,75:75,81:81,86:86,94:94}],52:[function(t,n,r){arguments[4][18][0].apply(r,arguments)},{18:18}],53:[function(t,n,r){"use strict";var e=t(99),i=t(116);n.exports=function(t,n,r){n in t?e.f(t,n,i(0,r)):t[n]=r}},{116:116,99:99}],54:[function(t,n,r){arguments[4][19][0].apply(r,arguments)},{19:19,33:33}],55:[function(t,n,r){"use strict";function Qi(t){return 9<t?t:"0"+t}var e=t(64),i=Date.prototype.getTime,o=Date.prototype.toISOString;n.exports=e(function(){return"0385-07-25T07:06:39.999Z"!=o.call(new Date(-5e13-1))})||!e(function(){o.call(new Date(NaN))})?function toISOString(){if(!isFinite(i.call(this)))throw RangeError("Invalid time value");var t=this,n=t.getUTCFullYear(),r=t.getUTCMilliseconds(),e=n<0?"-":9999<n?"+":"";return e+("00000"+Math.abs(n)).slice(e?-6:-4)+"-"+Qi(t.getUTCMonth()+1)+"-"+Qi(t.getUTCDate())+"T"+Qi(t.getUTCHours())+":"+Qi(t.getUTCMinutes())+":"+Qi(t.getUTCSeconds())+"."+(99<r?r:"0"+Qi(r))+"Z"}:o},{64:64}],56:[function(t,n,r){"use strict";var e=t(38),i=t(143);n.exports=function(t){if("string"!==t&&"number"!==t&&"default"!==t)throw TypeError("Incorrect hint");return i(e(this),"number"!=t)}},{143:143,38:38}],57:[function(t,n,r){n.exports=function(t){if(null==t)throw TypeError("Can't call method on  "+t);return t}},{}],58:[function(t,n,r){arguments[4][20][0].apply(r,arguments)},{20:20,64:64}],59:[function(t,n,r){arguments[4][21][0].apply(r,arguments)},{21:21,70:70,81:81}],60:[function(t,n,r){n.exports="constructor,hasOwnProperty,isPrototypeOf,propertyIsEnumerable,toLocaleString,toString,valueOf".split(",")},{}],61:[function(t,n,r){var c=t(107),a=t(104),f=t(108);n.exports=function(t){var n=c(t),r=a.f;if(r)for(var e,i=r(t),o=f.f,u=0;i.length>u;)o.call(t,e=i[u++])&&n.push(e);return n}},{104:104,107:107,108:108}],62:[function(t,n,r){var g=t(70),y=t(52),d=t(72),x=t(118),m=t(54),S="prototype",b=function(t,n,r){var e,i,o,u,c=t&b.F,a=t&b.G,f=t&b.S,s=t&b.P,l=t&b.B,h=a?g:f?g[n]||(g[n]={}):(g[n]||{})[S],p=a?y:y[n]||(y[n]={}),v=p[S]||(p[S]={});for(e in a&&(r=n),r)o=((i=!c&&h&&void 0!==h[e])?h:r)[e],u=l&&i?m(o,g):s&&"function"==typeof o?m(Function.call,o):o,h&&x(h,e,o,t&b.U),p[e]!=o&&d(p,e,u),s&&v[e]!=o&&(v[e]=o)};g.core=y,b.F=1,b.G=2,b.S=4,b.P=8,b.B=16,b.W=32,b.U=64,b.R=128,n.exports=b},{118:118,52:52,54:54,70:70,72:72}],63:[function(t,n,r){var e=t(152)("match");n.exports=function(n){var r=/./;try{"/./"[n](r)}catch(t){try{return r[e]=!1,!"/./"[n](r)}catch(t){}}return!0}},{152:152}],64:[function(t,n,r){arguments[4][23][0].apply(r,arguments)},{23:23}],65:[function(t,n,r){"use strict";t(248);var s=t(118),l=t(72),h=t(64),p=t(57),v=t(152),g=t(120),y=v("species"),d=!h(function(){var t=/./;return t.exec=function(){var t=[];return t.groups={a:"7"},t},"7"!=="".replace(t,"$<a>")}),x=function(){var t=/(?:)/,n=t.exec;t.exec=function(){return n.apply(this,arguments)};var r="ab".split(t);return 2===r.length&&"a"===r[0]&&"b"===r[1]}();n.exports=function(r,t,n){var e=v(r),o=!h(function(){var t={};return t[e]=function(){return 7},7!=""[r](t)}),i=o?!h(function(){var t=!1,n=/a/;return n.exec=function(){return t=!0,null},"split"===r&&(n.constructor={},n.constructor[y]=function(){return n}),n[e](""),!t}):void 0;if(!o||!i||"replace"===r&&!d||"split"===r&&!x){var u=/./[e],c=n(p,e,""[r],function maybeCallNative(t,n,r,e,i){return n.exec===g?o&&!i?{done:!0,value:u.call(n,r,e)}:{done:!0,value:t.call(r,n,e)}:{done:!1}}),a=c[0],f=c[1];s(String.prototype,r,a),l(RegExp.prototype,e,2==t?function(t,n){return f.call(t,this,n)}:function(t){return f.call(t,this)})}}},{118:118,120:120,152:152,248:248,57:57,64:64,72:72}],66:[function(t,n,r){"use strict";var e=t(38);n.exports=function(){var t=e(this),n="";return t.global&&(n+="g"),t.ignoreCase&&(n+="i"),t.multiline&&(n+="m"),t.unicode&&(n+="u"),t.sticky&&(n+="y"),n}},{38:38}],67:[function(t,n,r){"use strict";var p=t(79),v=t(81),g=t(141),y=t(54),d=t(152)("isConcatSpreadable");n.exports=function flattenIntoArray(t,n,r,e,i,o,u,c){for(var a,f,s=i,l=0,h=!!u&&y(u,c,3);l<e;){if(l in r){if(a=h?h(r[l],l,n):r[l],f=!1,v(a)&&(f=void 0!==(f=a[d])?!!f:p(a)),f&&0<o)s=flattenIntoArray(t,n,a,g(a.length),s,o-1)-1;else{if(9007199254740991<=s)throw TypeError();t[s]=a}s++}l++}return s}},{141:141,152:152,54:54,79:79,81:81}],68:[function(t,n,r){var h=t(54),p=t(83),v=t(78),g=t(38),y=t(141),d=t(153),x={},m={};(r=n.exports=function(t,n,r,e,i){var o,u,c,a,f=i?function(){return t}:d(t),s=h(r,e,n?2:1),l=0;if("function"!=typeof f)throw TypeError(t+" is not iterable!");if(v(f)){for(o=y(t.length);l<o;l++)if((a=n?s(g(u=t[l])[0],u[1]):s(t[l]))===x||a===m)return a}else for(c=f.call(t);!(u=c.next()).done;)if((a=p(c,s,u.value,n))===x||a===m)return a}).BREAK=x,r.RETURN=m},{141:141,153:153,38:38,54:54,78:78,83:83}],69:[function(t,n,r){n.exports=t(126)("native-function-to-string",Function.toString)},{126:126}],70:[function(t,n,r){arguments[4][24][0].apply(r,arguments)},{24:24}],71:[function(t,n,r){arguments[4][25][0].apply(r,arguments)},{25:25}],72:[function(t,n,r){arguments[4][26][0].apply(r,arguments)},{116:116,26:26,58:58,99:99}],73:[function(t,n,r){var e=t(70).document;n.exports=e&&e.documentElement},{70:70}],74:[function(t,n,r){arguments[4][27][0].apply(r,arguments)},{27:27,58:58,59:59,64:64}],75:[function(t,n,r){var o=t(81),u=t(122).set;n.exports=function(t,n,r){var e,i=n.constructor;return i!==r&&"function"==typeof i&&(e=i.prototype)!==r.prototype&&o(e)&&u&&u(t,e),t}},{122:122,81:81}],76:[function(t,n,r){n.exports=function(t,n,r){var e=void 0===r;switch(n.length){case 0:return e?t():t.call(r);case 1:return e?t(n[0]):t.call(r,n[0]);case 2:return e?t(n[0],n[1]):t.call(r,n[0],n[1]);case 3:return e?t(n[0],n[1],n[2]):t.call(r,n[0],n[1],n[2]);case 4:return e?t(n[0],n[1],n[2],n[3]):t.call(r,n[0],n[1],n[2],n[3])}return t.apply(r,n)}},{}],77:[function(t,n,r){var e=t(48);n.exports=Object("z").propertyIsEnumerable(0)?Object:function(t){return"String"==e(t)?t.split(""):Object(t)}},{48:48}],78:[function(t,n,r){var e=t(88),i=t(152)("iterator"),o=Array.prototype;n.exports=function(t){return void 0!==t&&(e.Array===t||o[i]===t)}},{152:152,88:88}],79:[function(t,n,r){var e=t(48);n.exports=Array.isArray||function isArray(t){return"Array"==e(t)}},{48:48}],80:[function(t,n,r){var e=t(81),i=Math.floor;n.exports=function isInteger(t){return!e(t)&&isFinite(t)&&i(t)===t}},{81:81}],81:[function(t,n,r){arguments[4][28][0].apply(r,arguments)},{28:28}],82:[function(t,n,r){var e=t(81),i=t(48),o=t(152)("match");n.exports=function(t){var n;return e(t)&&(void 0!==(n=t[o])?!!n:"RegExp"==i(t))}},{152:152,48:48,81:81}],83:[function(t,n,r){var o=t(38);n.exports=function(n,t,r,e){try{return e?t(o(r)[0],r[1]):t(r)}catch(t){var i=n.return;throw void 0!==i&&o(i.call(n)),t}}},{38:38}],84:[function(t,n,r){"use strict";var e=t(98),i=t(116),o=t(124),u={};t(72)(u,t(152)("iterator"),function(){return this}),n.exports=function(t,n,r){t.prototype=e(u,{next:i(1,r)}),o(t,n+" Iterator")}},{116:116,124:124,152:152,72:72,98:98}],85:[function(t,n,r){"use strict";function Qn(){return this}var x=t(89),m=t(62),S=t(118),b=t(72),w=t(88),_=t(84),E=t(124),O=t(105),F=t(152)("iterator"),I=!([].keys&&"next"in[].keys()),P="values";n.exports=function(t,n,r,e,i,o,u){_(r,n,e);function Yn(t){if(!I&&t in p)return p[t];switch(t){case"keys":return function keys(){return new r(this,t)};case P:return function values(){return new r(this,t)}}return function entries(){return new r(this,t)}}var c,a,f,s=n+" Iterator",l=i==P,h=!1,p=t.prototype,v=p[F]||p["@@iterator"]||i&&p[i],g=v||Yn(i),y=i?l?Yn("entries"):g:void 0,d="Array"==n&&p.entries||v;if(d&&(f=O(d.call(new t)))!==Object.prototype&&f.next&&(E(f,s,!0),x||"function"==typeof f[F]||b(f,F,Qn)),l&&v&&v.name!==P&&(h=!0,g=function values(){return v.call(this)}),x&&!u||!I&&!h&&p[F]||b(p,F,g),w[n]=g,w[s]=Qn,i)if(c={values:l?g:Yn(P),keys:o?g:Yn("keys"),entries:y},u)for(a in c)a in p||S(p,a,c[a]);else m(m.P+m.F*(I||h),n,c);return c}},{105:105,118:118,124:124,152:152,62:62,72:72,84:84,88:88,89:89}],86:[function(t,n,r){var o=t(152)("iterator"),u=!1;try{var e=[7][o]();e.return=function(){u=!0},Array.from(e,function(){throw 2})}catch(t){}n.exports=function(t,n){if(!n&&!u)return!1;var r=!1;try{var e=[7],i=e[o]();i.next=function(){return{done:r=!0}},e[o]=function(){return i},t(e)}catch(t){}return r}},{152:152}],87:[function(t,n,r){n.exports=function(t,n){return{value:n,done:!!t}}},{}],88:[function(t,n,r){n.exports={}},{}],89:[function(t,n,r){n.exports=!1},{}],90:[function(t,n,r){var e=Math.expm1;n.exports=!e||22025.465794806718<e(10)||e(10)<22025.465794806718||-2e-17!=e(-2e-17)?function expm1(t){return 0==(t=+t)?t:-1e-6<t&&t<1e-6?t+t*t/2:Math.exp(t)-1}:e},{}],91:[function(t,n,r){var o=t(93),e=Math.pow,u=e(2,-52),c=e(2,-23),a=e(2,127)*(2-c),f=e(2,-126);n.exports=Math.fround||function fround(t){var n,r,e=Math.abs(t),i=o(t);return e<f?i*(e/f/c+1/u-1/u)*f*c:a<(r=(n=(1+c/u)*e)-(n-e))||r!=r?i*(1/0):i*r}},{93:93}],92:[function(t,n,r){n.exports=Math.log1p||function log1p(t){return-1e-8<(t=+t)&&t<1e-8?t-t*t/2:Math.log(1+t)}},{}],93:[function(t,n,r){n.exports=Math.sign||function sign(t){return 0==(t=+t)||t!=t?t:t<0?-1:1}},{}],94:[function(t,n,r){function tp(t){u(t,e,{value:{i:"O"+ ++c,w:{}}})}var e=t(147)("meta"),i=t(81),o=t(71),u=t(99).f,c=0,a=Object.isExtensible||function(){return!0},f=!t(64)(function(){return a(Object.preventExtensions({}))}),s=n.exports={KEY:e,NEED:!1,fastKey:function(t,n){if(!i(t))return"symbol"==typeof t?t:("string"==typeof t?"S":"P")+t;if(!o(t,e)){if(!a(t))return"F";if(!n)return"E";tp(t)}return t[e].i},getWeak:function(t,n){if(!o(t,e)){if(!a(t))return!0;if(!n)return!1;tp(t)}return t[e].w},onFreeze:function(t){return f&&s.NEED&&a(t)&&!o(t,e)&&tp(t),t}}},{147:147,64:64,71:71,81:81,99:99}],95:[function(t,n,r){var u=t(70),c=t(136).set,a=u.MutationObserver||u.WebKitMutationObserver,f=u.process,s=u.Promise,l="process"==t(48)(f);n.exports=function(){function Qp(){var t,n;for(l&&(t=f.domain)&&t.exit();r;){n=r.fn,r=r.next;try{n()}catch(t){throw r?i():e=void 0,t}}e=void 0,t&&t.enter()}var r,e,i;if(l)i=function(){f.nextTick(Qp)};else if(!a||u.navigator&&u.navigator.standalone)if(s&&s.resolve){var t=s.resolve(void 0);i=function(){t.then(Qp)}}else i=function(){c.call(u,Qp)};else{var n=!0,o=document.createTextNode("");new a(Qp).observe(o,{characterData:!0}),i=function(){o.data=n=!n}}return function(t){var n={fn:t,next:void 0};e&&(e.next=n),r||(r=n,i()),e=n}}},{136:136,48:48,70:70}],96:[function(t,n,r){"use strict";var i=t(33);function PromiseCapability(t){var r,e;this.promise=new t(function(t,n){if(void 0!==r||void 0!==e)throw TypeError("Bad Promise constructor");r=t,e=n}),this.resolve=i(r),this.reject=i(e)}n.exports.f=function(t){return new PromiseCapability(t)}},{33:33}],97:[function(t,n,r){"use strict";var h=t(58),p=t(107),v=t(104),g=t(108),y=t(142),d=t(77),i=Object.assign;n.exports=!i||t(64)(function(){var t={},n={},r=Symbol(),e="abcdefghijklmnopqrst";return t[r]=7,e.split("").forEach(function(t){n[t]=t}),7!=i({},t)[r]||Object.keys(i({},n)).join("")!=e})?function assign(t,n){for(var r=y(t),e=arguments.length,i=1,o=v.f,u=g.f;i<e;)for(var c,a=d(arguments[i++]),f=o?p(a).concat(o(a)):p(a),s=f.length,l=0;l<s;)c=f[l++],h&&!u.call(a,c)||(r[c]=a[c]);return r}:i},{104:104,107:107,108:108,142:142,58:58,64:64,77:77}],98:[function(e,t,n){function Pq(){}var i=e(38),o=e(100),u=e(60),c=e(125)("IE_PROTO"),a="prototype",f=function(){var t,n=e(59)("iframe"),r=u.length;for(n.style.display="none",e(73).appendChild(n),n.src="javascript:",(t=n.contentWindow.document).open(),t.write("<script>document.F=Object<\/script>"),t.close(),f=t.F;r--;)delete f[a][u[r]];return f()};t.exports=Object.create||function create(t,n){var r;return null!==t?(Pq[a]=i(t),r=new Pq,Pq[a]=null,r[c]=t):r=f(),void 0===n?r:o(r,n)}},{100:100,125:125,38:38,59:59,60:60,73:73}],99:[function(t,n,r){arguments[4][29][0].apply(r,arguments)},{143:143,29:29,38:38,58:58,74:74}],100:[function(t,n,r){var u=t(99),c=t(38),a=t(107);n.exports=t(58)?Object.defineProperties:function defineProperties(t,n){c(t);for(var r,e=a(n),i=e.length,o=0;o<i;)u.f(t,r=e[o++],n[r]);return t}},{107:107,38:38,58:58,99:99}],101:[function(t,n,r){var e=t(108),i=t(116),o=t(140),u=t(143),c=t(71),a=t(74),f=Object.getOwnPropertyDescriptor;r.f=t(58)?f:function getOwnPropertyDescriptor(t,n){if(t=o(t),n=u(n,!0),a)try{return f(t,n)}catch(t){}if(c(t,n))return i(!e.f.call(t,n),t[n])}},{108:108,116:116,140:140,143:143,58:58,71:71,74:74}],102:[function(t,n,r){var e=t(140),i=t(103).f,o={}.toString,u="object"==typeof window&&window&&Object.getOwnPropertyNames?Object.getOwnPropertyNames(window):[];n.exports.f=function getOwnPropertyNames(t){return u&&"[object Window]"==o.call(t)?function(t){try{return i(t)}catch(t){return u.slice()}}(t):i(e(t))}},{103:103,140:140}],103:[function(t,n,r){var e=t(106),i=t(60).concat("length","prototype");r.f=Object.getOwnPropertyNames||function getOwnPropertyNames(t){return e(t,i)}},{106:106,60:60}],104:[function(t,n,r){r.f=Object.getOwnPropertySymbols},{}],105:[function(t,n,r){var e=t(71),i=t(142),o=t(125)("IE_PROTO"),u=Object.prototype;n.exports=Object.getPrototypeOf||function(t){return t=i(t),e(t,o)?t[o]:"function"==typeof t.constructor&&t instanceof t.constructor?t.constructor.prototype:t instanceof Object?u:null}},{125:125,142:142,71:71}],106:[function(t,n,r){var u=t(71),c=t(140),a=t(41)(!1),f=t(125)("IE_PROTO");n.exports=function(t,n){var r,e=c(t),i=0,o=[];for(r in e)r!=f&&u(e,r)&&o.push(r);for(;n.length>i;)u(e,r=n[i++])&&(~a(o,r)||o.push(r));return o}},{125:125,140:140,41:41,71:71}],107:[function(t,n,r){var e=t(106),i=t(60);n.exports=Object.keys||function keys(t){return e(t,i)}},{106:106,60:60}],108:[function(t,n,r){r.f={}.propertyIsEnumerable},{}],109:[function(t,n,r){var i=t(62),o=t(52),u=t(64);n.exports=function(t,n){var r=(o.Object||{})[t]||Object[t],e={};e[t]=n(r),i(i.S+i.F*u(function(){r(1)}),"Object",e)}},{52:52,62:62,64:64}],110:[function(t,n,r){var a=t(58),f=t(107),s=t(140),l=t(108).f;n.exports=function(c){return function(t){for(var n,r=s(t),e=f(r),i=e.length,o=0,u=[];o<i;)n=e[o++],a&&!l.call(r,n)||u.push(c?[n,r[n]]:r[n]);return u}}},{107:107,108:108,140:140,58:58}],111:[function(t,n,r){var e=t(103),i=t(104),o=t(38),u=t(70).Reflect;n.exports=u&&u.ownKeys||function ownKeys(t){var n=e.f(o(t)),r=i.f;return r?n.concat(r(t)):n}},{103:103,104:104,38:38,70:70}],112:[function(t,n,r){var e=t(70).parseFloat,i=t(134).trim;n.exports=1/e(t(135)+"-0")!=-1/0?function parseFloat(t){var n=i(String(t),3),r=e(n);return 0===r&&"-"==n.charAt(0)?-0:r}:e},{134:134,135:135,70:70}],113:[function(t,n,r){var e=t(70).parseInt,i=t(134).trim,o=t(135),u=/^[-+]?0[xX]/;n.exports=8!==e(o+"08")||22!==e(o+"0x16")?function parseInt(t,n){var r=i(String(t),3);return e(r,n>>>0||(u.test(r)?16:10))}:e},{134:134,135:135,70:70}],114:[function(t,n,r){n.exports=function(t){try{return{e:!1,v:t()}}catch(t){return{e:!0,v:t}}}},{}],115:[function(t,n,r){var e=t(38),i=t(81),o=t(96);n.exports=function(t,n){if(e(t),i(n)&&n.constructor===t)return n;var r=o.f(t);return(0,r.resolve)(n),r.promise}},{38:38,81:81,96:96}],116:[function(t,n,r){arguments[4][30][0].apply(r,arguments)},{30:30}],117:[function(t,n,r){var i=t(118);n.exports=function(t,n,r){for(var e in n)i(t,e,n[e],r);return t}},{118:118}],118:[function(t,n,r){var o=t(70),u=t(72),c=t(71),a=t(147)("src"),e=t(69),i="toString",f=(""+e).split(i);t(52).inspectSource=function(t){return e.call(t)},(n.exports=function(t,n,r,e){var i="function"==typeof r;i&&(c(r,"name")||u(r,"name",n)),t[n]!==r&&(i&&(c(r,a)||u(r,a,t[n]?""+t[n]:f.join(String(n)))),t===o?t[n]=r:e?t[n]?t[n]=r:u(t,n,r):(delete t[n],u(t,n,r)))})(Function.prototype,i,function toString(){return"function"==typeof this&&this[a]||e.call(this)})},{147:147,52:52,69:69,70:70,71:71,72:72}],119:[function(t,n,r){"use strict";var i=t(47),o=RegExp.prototype.exec;n.exports=function(t,n){var r=t.exec;if("function"==typeof r){var e=r.call(t,n);if("object"!=typeof e)throw new TypeError("RegExp exec method returned something other than an Object or null");return e}if("RegExp"!==i(t))throw new TypeError("RegExp#exec called on incompatible receiver");return o.call(t,n)}},{47:47}],120:[function(t,n,r){"use strict";var e,i,u=t(66),c=RegExp.prototype.exec,a=String.prototype.replace,o=c,f="lastIndex",s=(e=/a/,i=/b*/g,c.call(e,"a"),c.call(i,"a"),0!==e[f]||0!==i[f]),l=void 0!==/()??/.exec("")[1];(s||l)&&(o=function exec(t){var n,r,e,i,o=this;return l&&(r=new RegExp("^"+o.source+"$(?!\\s)",u.call(o))),s&&(n=o[f]),e=c.call(o,t),s&&e&&(o[f]=o.global?e.index+e[0].length:n),l&&e&&1<e.length&&a.call(e[0],r,function(){for(i=1;i<arguments.length-2;i++)void 0===arguments[i]&&(e[i]=void 0)}),e}),n.exports=o},{66:66}],121:[function(t,n,r){n.exports=Object.is||function is(t,n){return t===n?0!==t||1/t==1/n:t!=t&&n!=n}},{}],122:[function(n,t,r){function Wu(t,n){if(i(t),!e(n)&&null!==n)throw TypeError(n+": can't set as prototype!")}var e=n(81),i=n(38);t.exports={set:Object.setPrototypeOf||("__proto__"in{}?function(t,r,e){try{(e=n(54)(Function.call,n(101).f(Object.prototype,"__proto__").set,2))(t,[]),r=!(t instanceof Array)}catch(t){r=!0}return function setPrototypeOf(t,n){return Wu(t,n),r?t.__proto__=n:e(t,n),t}}({},!1):void 0),check:Wu}},{101:101,38:38,54:54,81:81}],123:[function(t,n,r){"use strict";var e=t(70),i=t(99),o=t(58),u=t(152)("species");n.exports=function(t){var n=e[t];o&&n&&!n[u]&&i.f(n,u,{configurable:!0,get:function(){return this}})}},{152:152,58:58,70:70,99:99}],124:[function(t,n,r){var e=t(99).f,i=t(71),o=t(152)("toStringTag");n.exports=function(t,n,r){t&&!i(t=r?t:t.prototype,o)&&e(t,o,{configurable:!0,value:n})}},{152:152,71:71,99:99}],125:[function(t,n,r){var e=t(126)("keys"),i=t(147);n.exports=function(t){return e[t]||(e[t]=i(t))}},{126:126,147:147}],126:[function(t,n,r){var e=t(52),i=t(70),o="__core-js_shared__",u=i[o]||(i[o]={});(n.exports=function(t,n){return u[t]||(u[t]=void 0!==n?n:{})})("versions",[]).push({version:e.version,mode:t(89)?"pure":"global",copyright:"© 2019 Denis Pushkarev (zloirock.ru)"})},{52:52,70:70,89:89}],127:[function(t,n,r){var i=t(38),o=t(33),u=t(152)("species");n.exports=function(t,n){var r,e=i(t).constructor;return void 0===e||null==(r=i(e)[u])?n:o(r)}},{152:152,33:33,38:38}],128:[function(t,n,r){"use strict";var e=t(64);n.exports=function(t,n){return!!t&&e(function(){n?t.call(null,function(){},1):t.call(null)})}},{64:64}],129:[function(t,n,r){var a=t(139),f=t(57);n.exports=function(c){return function(t,n){var r,e,i=String(f(t)),o=a(n),u=i.length;return o<0||u<=o?c?"":void 0:(r=i.charCodeAt(o))<55296||56319<r||o+1===u||(e=i.charCodeAt(o+1))<56320||57343<e?c?i.charAt(o):r:c?i.slice(o,o+2):e-56320+(r-55296<<10)+65536}}},{139:139,57:57}],130:[function(t,n,r){var e=t(82),i=t(57);n.exports=function(t,n,r){if(e(n))throw TypeError("String#"+r+" doesn't accept regex!");return String(i(t))}},{57:57,82:82}],131:[function(t,n,r){function Aw(t,n,r,e){var i=String(u(t)),o="<"+n;return""!==r&&(o+=" "+r+'="'+String(e).replace(c,"&quot;")+'"'),o+">"+i+"</"+n+">"}var e=t(62),i=t(64),u=t(57),c=/"/g;n.exports=function(n,t){var r={};r[n]=t(Aw),e(e.P+e.F*i(function(){var t=""[n]('"');return t!==t.toLowerCase()||3<t.split('"').length}),"String",r)}},{57:57,62:62,64:64}],132:[function(t,n,r){var s=t(141),l=t(133),h=t(57);n.exports=function(t,n,r,e){var i=String(h(t)),o=i.length,u=void 0===r?" ":String(r),c=s(n);if(c<=o||""==u)return i;var a=c-o,f=l.call(u,Math.ceil(a/u.length));return f.length>a&&(f=f.slice(0,a)),e?f+i:i+f}},{133:133,141:141,57:57}],133:[function(t,n,r){"use strict";var i=t(139),o=t(57);n.exports=function repeat(t){var n=String(o(this)),r="",e=i(t);if(e<0||e==1/0)throw RangeError("Count can't be negative");for(;0<e;(e>>>=1)&&(n+=n))1&e&&(r+=n);return r}},{139:139,57:57}],134:[function(t,n,r){function tx(t,n,r){var e={},i=c(function(){return!!a[t]()||"​"!="​"[t]()}),o=e[t]=i?n(s):a[t];r&&(e[r]=o),u(u.P+u.F*i,"String",e)}var u=t(62),e=t(57),c=t(64),a=t(135),i="["+a+"]",o=RegExp("^"+i+i+"*"),f=RegExp(i+i+"*$"),s=tx.trim=function(t,n){return t=String(e(t)),1&n&&(t=t.replace(o,"")),2&n&&(t=t.replace(f,"")),t};n.exports=tx},{135:135,57:57,62:62,64:64}],135:[function(t,n,r){n.exports="\t\n\v\f\r   ᠎             　\u2028\u2029\ufeff"},{}],136:[function(t,n,r){function Zx(){var t=+this;if(d.hasOwnProperty(t)){var n=d[t];delete d[t],n()}}function $x(t){Zx.call(t.data)}var e,i,o,u=t(54),c=t(76),a=t(73),f=t(59),s=t(70),l=s.process,h=s.setImmediate,p=s.clearImmediate,v=s.MessageChannel,g=s.Dispatch,y=0,d={},x="onreadystatechange";h&&p||(h=function setImmediate(t){for(var n=[],r=1;r<arguments.length;)n.push(arguments[r++]);return d[++y]=function(){c("function"==typeof t?t:Function(t),n)},e(y),y},p=function clearImmediate(t){delete d[t]},"process"==t(48)(l)?e=function(t){l.nextTick(u(Zx,t,1))}:g&&g.now?e=function(t){g.now(u(Zx,t,1))}:v?(o=(i=new v).port2,i.port1.onmessage=$x,e=u(o.postMessage,o,1)):s.addEventListener&&"function"==typeof postMessage&&!s.importScripts?(e=function(t){s.postMessage(t+"","*")},s.addEventListener("message",$x,!1)):e=x in f("script")?function(t){a.appendChild(f("script"))[x]=function(){a.removeChild(this),Zx.call(t)}}:function(t){setTimeout(u(Zx,t,1),0)}),n.exports={set:h,clear:p}},{48:48,54:54,59:59,70:70,73:73,76:76}],137:[function(t,n,r){var e=t(139),i=Math.max,o=Math.min;n.exports=function(t,n){return(t=e(t))<0?i(t+n,0):o(t,n)}},{139:139}],138:[function(t,n,r){var e=t(139),i=t(141);n.exports=function(t){if(void 0===t)return 0;var n=e(t),r=i(n);if(n!==r)throw RangeError("Wrong length!");return r}},{139:139,141:141}],139:[function(t,n,r){var e=Math.ceil,i=Math.floor;n.exports=function(t){return isNaN(t=+t)?0:(0<t?i:e)(t)}},{}],140:[function(t,n,r){var e=t(77),i=t(57);n.exports=function(t){return e(i(t))}},{57:57,77:77}],141:[function(t,n,r){var e=t(139),i=Math.min;n.exports=function(t){return 0<t?i(e(t),9007199254740991):0}},{139:139}],142:[function(t,n,r){var e=t(57);n.exports=function(t){return Object(e(t))}},{57:57}],143:[function(t,n,r){arguments[4][31][0].apply(r,arguments)},{31:31,81:81}],144:[function(t,n,r){"use strict";if(t(58)){var y=t(89),d=t(70),x=t(64),m=t(62),S=t(146),e=t(145),h=t(54),b=t(37),i=t(116),w=t(72),o=t(117),u=t(139),_=t(141),E=t(138),c=t(137),a=t(143),f=t(71),O=t(47),F=t(81),p=t(142),v=t(78),I=t(98),P=t(105),A=t(103).f,g=t(153),s=t(147),l=t(152),M=t(42),k=t(41),N=t(127),j=t(164),R=t(88),T=t(86),L=t(123),C=t(40),G=t(39),D=t(99),U=t(101),W=D.f,V=U.f,B=d.RangeError,q=d.TypeError,Y=d.Uint8Array,z="ArrayBuffer",X="Shared"+z,$="BYTES_PER_ELEMENT",Q="prototype",Z=Array[Q],J=e.ArrayBuffer,H=e.DataView,K=M(0),tt=M(2),nt=M(3),rt=M(4),et=M(5),it=M(6),ot=k(!0),ut=k(!1),ct=j.values,at=j.keys,ft=j.entries,st=Z.lastIndexOf,lt=Z.reduce,ht=Z.reduceRight,pt=Z.join,vt=Z.sort,gt=Z.slice,yt=Z.toString,dt=Z.toLocaleString,xt=l("iterator"),mt=l("toStringTag"),St=s("typed_constructor"),bt=s("def_constructor"),wt=S.CONSTR,_t=S.TYPED,Et=S.VIEW,Ot="Wrong length!",Ft=M(1,function(t,n){return kt(N(t,t[bt]),n)}),It=x(function(){return 1===new Y(new Uint16Array([1]).buffer)[0]}),Pt=!!Y&&!!Y[Q].set&&x(function(){new Y(1).set({})}),At=function(t,n){var r=u(t);if(r<0||r%n)throw B("Wrong offset!");return r},Mt=function(t){if(F(t)&&_t in t)return t;throw q(t+" is not a typed array!")},kt=function(t,n){if(!(F(t)&&St in t))throw q("It is not a typed array constructor!");return new t(n)},Nt=function(t,n){return jt(N(t,t[bt]),n)},jt=function(t,n){for(var r=0,e=n.length,i=kt(t,e);r<e;)i[r]=n[r++];return i},Rt=function(t,n,r){W(t,n,{get:function(){return this._d[r]}})},Tt=function from(t){var n,r,e,i,o,u,c=p(t),a=arguments.length,f=1<a?arguments[1]:void 0,s=void 0!==f,l=g(c);if(null!=l&&!v(l)){for(u=l.call(c),e=[],n=0;!(o=u.next()).done;n++)e.push(o.value);c=e}for(s&&2<a&&(f=h(f,arguments[2],2)),n=0,r=_(c.length),i=kt(this,r);n<r;n++)i[n]=s?f(c[n],n):c[n];return i},Lt=function of(){for(var t=0,n=arguments.length,r=kt(this,n);t<n;)r[t]=arguments[t++];return r},Ct=!!Y&&x(function(){dt.call(new Y(1))}),Gt=function toLocaleString(){return dt.apply(Ct?gt.call(Mt(this)):Mt(this),arguments)},Dt={copyWithin:function copyWithin(t,n){return G.call(Mt(this),t,n,2<arguments.length?arguments[2]:void 0)},every:function every(t){return rt(Mt(this),t,1<arguments.length?arguments[1]:void 0)},fill:function fill(t){return C.apply(Mt(this),arguments)},filter:function filter(t){return Nt(this,tt(Mt(this),t,1<arguments.length?arguments[1]:void 0))},find:function find(t){return et(Mt(this),t,1<arguments.length?arguments[1]:void 0)},findIndex:function findIndex(t){return it(Mt(this),t,1<arguments.length?arguments[1]:void 0)},forEach:function forEach(t){K(Mt(this),t,1<arguments.length?arguments[1]:void 0)},indexOf:function indexOf(t){return ut(Mt(this),t,1<arguments.length?arguments[1]:void 0)},includes:function includes(t){return ot(Mt(this),t,1<arguments.length?arguments[1]:void 0)},join:function join(t){return pt.apply(Mt(this),arguments)},lastIndexOf:function lastIndexOf(t){return st.apply(Mt(this),arguments)},map:function map(t){return Ft(Mt(this),t,1<arguments.length?arguments[1]:void 0)},reduce:function reduce(t){return lt.apply(Mt(this),arguments)},reduceRight:function reduceRight(t){return ht.apply(Mt(this),arguments)},reverse:function reverse(){for(var t,n=this,r=Mt(n).length,e=Math.floor(r/2),i=0;i<e;)t=n[i],n[i++]=n[--r],n[r]=t;return n},some:function some(t){return nt(Mt(this),t,1<arguments.length?arguments[1]:void 0)},sort:function sort(t){return vt.call(Mt(this),t)},subarray:function subarray(t,n){var r=Mt(this),e=r.length,i=c(t,e);return new(N(r,r[bt]))(r.buffer,r.byteOffset+i*r.BYTES_PER_ELEMENT,_((void 0===n?e:c(n,e))-i))}},Ut=function slice(t,n){return Nt(this,gt.call(Mt(this),t,n))},Wt=function set(t){Mt(this);var n=At(arguments[1],1),r=this.length,e=p(t),i=_(e.length),o=0;if(r<i+n)throw B(Ot);for(;o<i;)this[n+o]=e[o++]},Vt={entries:function entries(){return ft.call(Mt(this))},keys:function keys(){return at.call(Mt(this))},values:function values(){return ct.call(Mt(this))}},Bt=function(t,n){return F(t)&&t[_t]&&"symbol"!=typeof n&&n in t&&String(+n)==String(n)},qt=function getOwnPropertyDescriptor(t,n){return Bt(t,n=a(n,!0))?i(2,t[n]):V(t,n)},Yt=function defineProperty(t,n,r){return!(Bt(t,n=a(n,!0))&&F(r)&&f(r,"value"))||f(r,"get")||f(r,"set")||r.configurable||f(r,"writable")&&!r.writable||f(r,"enumerable")&&!r.enumerable?W(t,n,r):(t[n]=r.value,t)};wt||(U.f=qt,D.f=Yt),m(m.S+m.F*!wt,"Object",{getOwnPropertyDescriptor:qt,defineProperty:Yt}),x(function(){yt.call({})})&&(yt=dt=function toString(){return pt.call(this)});var zt=o({},Dt);o(zt,Vt),w(zt,xt,Vt.values),o(zt,{slice:Ut,set:Wt,constructor:function(){},toString:yt,toLocaleString:Gt}),Rt(zt,"buffer","b"),Rt(zt,"byteOffset","o"),Rt(zt,"byteLength","l"),Rt(zt,"length","e"),W(zt,mt,{get:function(){return this[_t]}}),n.exports=function(t,l,n,o){function CC(t,i){W(t,i,{get:function(){return t=i,(n=this._d).v[r](t*l+n.o,It);var t,n},set:function(t){return n=i,r=t,e=this._d,o&&(r=(r=Math.round(r))<0?0:255<r?255:255&r),void e.v[u](n*l+e.o,r,It);var n,r,e},enumerable:!0})}var h=t+((o=!!o)?"Clamped":"")+"Array",r="get"+t,u="set"+t,p=d[h],c=p||{},e=p&&P(p),i=!p||!S.ABV,a={},f=p&&p[Q];i?(p=n(function(t,n,r,e){b(t,p,h,"_d");var i,o,u,c,a=0,f=0;if(F(n)){if(!(n instanceof J||(c=O(n))==z||c==X))return _t in n?jt(p,n):Tt.call(p,n);i=n,f=At(r,l);var s=n.byteLength;if(void 0===e){if(s%l)throw B(Ot);if((o=s-f)<0)throw B(Ot)}else if(s<(o=_(e)*l)+f)throw B(Ot);u=o/l}else u=E(n),i=new J(o=u*l);for(w(t,"_d",{b:i,o:f,l:o,e:u,v:new H(i)});a<u;)CC(t,a++)}),f=p[Q]=I(zt),w(f,"constructor",p)):x(function(){p(1)})&&x(function(){new p(-1)})&&T(function(t){new p,new p(null),new p(1.5),new p(t)},!0)||(p=n(function(t,n,r,e){var i;return b(t,p,h),F(n)?n instanceof J||(i=O(n))==z||i==X?void 0!==e?new c(n,At(r,l),e):void 0!==r?new c(n,At(r,l)):new c(n):_t in n?jt(p,n):Tt.call(p,n):new c(E(n))}),K(e!==Function.prototype?A(c).concat(A(e)):A(c),function(t){t in p||w(p,t,c[t])}),p[Q]=f,y||(f.constructor=p));var s=f[xt],v=!!s&&("values"==s.name||null==s.name),g=Vt.values;w(p,St,!0),w(f,_t,h),w(f,Et,!0),w(f,bt,p),(o?new p(1)[mt]==h:mt in f)||W(f,mt,{get:function(){return h}}),a[h]=p,m(m.G+m.W+m.F*(p!=c),a),m(m.S,h,{BYTES_PER_ELEMENT:l}),m(m.S+m.F*x(function(){c.of.call(p,1)}),h,{from:Tt,of:Lt}),$ in f||w(f,$,l),m(m.P,h,Dt),L(h),m(m.P+m.F*Pt,h,{set:Wt}),m(m.P+m.F*!v,h,Vt),y||f.toString==yt||(f.toString=yt),m(m.P+m.F*x(function(){new p(1).slice()}),h,{slice:Ut}),m(m.P+m.F*(x(function(){return[1,2].toLocaleString()!=new p([1,2]).toLocaleString()})||!x(function(){f.toLocaleString.call([1,2])})),h,{toLocaleString:Gt}),R[h]=v?s:g,y||v||w(f,xt,g)}}else n.exports=function(){}},{101:101,103:103,105:105,116:116,117:117,123:123,127:127,137:137,138:138,139:139,141:141,142:142,143:143,145:145,146:146,147:147,152:152,153:153,164:164,37:37,39:39,40:40,41:41,42:42,47:47,54:54,58:58,62:62,64:64,70:70,71:71,72:72,78:78,81:81,86:86,88:88,89:89,98:98,99:99}],145:[function(t,n,r){"use strict";var e=t(70),i=t(58),o=t(89),u=t(146),c=t(72),a=t(117),f=t(64),s=t(37),l=t(139),h=t(141),p=t(138),v=t(103).f,g=t(99).f,y=t(40),d=t(124),x="ArrayBuffer",m="DataView",S="prototype",b="Wrong index!",w=e[x],_=e[m],E=e.Math,O=e.RangeError,F=e.Infinity,I=w,P=E.abs,A=E.pow,M=E.floor,k=E.log,N=E.LN2,j="byteLength",R="byteOffset",T=i?"_b":"buffer",L=i?"_l":j,C=i?"_o":R;function packIEEE754(t,n,r){var e,i,o,u=new Array(r),c=8*r-n-1,a=(1<<c)-1,f=a>>1,s=23===n?A(2,-24)-A(2,-77):0,l=0,h=t<0||0===t&&1/t<0?1:0;for((t=P(t))!=t||t===F?(i=t!=t?1:0,e=a):(e=M(k(t)/N),t*(o=A(2,-e))<1&&(e--,o*=2),2<=(t+=1<=e+f?s/o:s*A(2,1-f))*o&&(e++,o/=2),a<=e+f?(i=0,e=a):1<=e+f?(i=(t*o-1)*A(2,n),e+=f):(i=t*A(2,f-1)*A(2,n),e=0));8<=n;u[l++]=255&i,i/=256,n-=8);for(e=e<<n|i,c+=n;0<c;u[l++]=255&e,e/=256,c-=8);return u[--l]|=128*h,u}function unpackIEEE754(t,n,r){var e,i=8*r-n-1,o=(1<<i)-1,u=o>>1,c=i-7,a=r-1,f=t[a--],s=127&f;for(f>>=7;0<c;s=256*s+t[a],a--,c-=8);for(e=s&(1<<-c)-1,s>>=-c,c+=n;0<c;e=256*e+t[a],a--,c-=8);if(0===s)s=1-u;else{if(s===o)return e?NaN:f?-F:F;e+=A(2,n),s-=u}return(f?-1:1)*e*A(2,s-n)}function unpackI32(t){return t[3]<<24|t[2]<<16|t[1]<<8|t[0]}function packI8(t){return[255&t]}function packI16(t){return[255&t,t>>8&255]}function packI32(t){return[255&t,t>>8&255,t>>16&255,t>>24&255]}function packF64(t){return packIEEE754(t,52,8)}function packF32(t){return packIEEE754(t,23,4)}function addGetter(t,n,r){g(t[S],n,{get:function(){return this[r]}})}function get(t,n,r,e){var i=p(+r);if(i+n>t[L])throw O(b);var o=t[T]._b,u=i+t[C],c=o.slice(u,u+n);return e?c:c.reverse()}function set(t,n,r,e,i,o){var u=p(+r);if(u+n>t[L])throw O(b);for(var c=t[T]._b,a=u+t[C],f=e(+i),s=0;s<n;s++)c[a+s]=f[o?s:n-s-1]}if(u.ABV){if(!f(function(){w(1)})||!f(function(){new w(-1)})||f(function(){return new w,new w(1.5),new w(NaN),w.name!=x})){for(var G,D=(w=function ArrayBuffer(t){return s(this,w),new I(p(t))})[S]=I[S],U=v(I),W=0;U.length>W;)(G=U[W++])in w||c(w,G,I[G]);o||(D.constructor=w)}var V=new _(new w(2)),B=_[S].setInt8;V.setInt8(0,2147483648),V.setInt8(1,2147483649),!V.getInt8(0)&&V.getInt8(1)||a(_[S],{setInt8:function setInt8(t,n){B.call(this,t,n<<24>>24)},setUint8:function setUint8(t,n){B.call(this,t,n<<24>>24)}},!0)}else w=function ArrayBuffer(t){s(this,w,x);var n=p(t);this._b=y.call(new Array(n),0),this[L]=n},_=function DataView(t,n,r){s(this,_,m),s(t,w,m);var e=t[L],i=l(n);if(i<0||e<i)throw O("Wrong offset!");if(e<i+(r=void 0===r?e-i:h(r)))throw O("Wrong length!");this[T]=t,this[C]=i,this[L]=r},i&&(addGetter(w,j,"_l"),addGetter(_,"buffer","_b"),addGetter(_,j,"_l"),addGetter(_,R,"_o")),a(_[S],{getInt8:function getInt8(t){return get(this,1,t)[0]<<24>>24},getUint8:function getUint8(t){return get(this,1,t)[0]},getInt16:function getInt16(t){var n=get(this,2,t,arguments[1]);return(n[1]<<8|n[0])<<16>>16},getUint16:function getUint16(t){var n=get(this,2,t,arguments[1]);return n[1]<<8|n[0]},getInt32:function getInt32(t){return unpackI32(get(this,4,t,arguments[1]))},getUint32:function getUint32(t){return unpackI32(get(this,4,t,arguments[1]))>>>0},getFloat32:function getFloat32(t){return unpackIEEE754(get(this,4,t,arguments[1]),23,4)},getFloat64:function getFloat64(t){return unpackIEEE754(get(this,8,t,arguments[1]),52,8)},setInt8:function setInt8(t,n){set(this,1,t,packI8,n)},setUint8:function setUint8(t,n){set(this,1,t,packI8,n)},setInt16:function setInt16(t,n){set(this,2,t,packI16,n,arguments[2])},setUint16:function setUint16(t,n){set(this,2,t,packI16,n,arguments[2])},setInt32:function setInt32(t,n){set(this,4,t,packI32,n,arguments[2])},setUint32:function setUint32(t,n){set(this,4,t,packI32,n,arguments[2])},setFloat32:function setFloat32(t,n){set(this,4,t,packF32,n,arguments[2])},setFloat64:function setFloat64(t,n){set(this,8,t,packF64,n,arguments[2])}});d(w,x),d(_,m),c(_[S],u.VIEW,!0),r[x]=w,r[m]=_},{103:103,117:117,124:124,138:138,139:139,141:141,146:146,37:37,40:40,58:58,64:64,70:70,72:72,89:89,99:99}],146:[function(t,n,r){for(var e,i=t(70),o=t(72),u=t(147),c=u("typed_array"),a=u("view"),f=!(!i.ArrayBuffer||!i.DataView),s=f,l=0,h="Int8Array,Uint8Array,Uint8ClampedArray,Int16Array,Uint16Array,Int32Array,Uint32Array,Float32Array,Float64Array".split(",");l<9;)(e=i[h[l++]])?(o(e.prototype,c,!0),o(e.prototype,a,!0)):s=!1;n.exports={ABV:f,CONSTR:s,TYPED:c,VIEW:a}},{147:147,70:70,72:72}],147:[function(t,n,r){var e=0,i=Math.random();n.exports=function(t){return"Symbol(".concat(void 0===t?"":t,")_",(++e+i).toString(36))}},{}],148:[function(t,n,r){var e=t(70).navigator;n.exports=e&&e.userAgent||""},{70:70}],149:[function(t,n,r){var e=t(81);n.exports=function(t,n){if(!e(t)||t._t!==n)throw TypeError("Incompatible receiver, "+n+" required!");return t}},{81:81}],150:[function(t,n,r){var e=t(70),i=t(52),o=t(89),u=t(151),c=t(99).f;n.exports=function(t){var n=i.Symbol||(i.Symbol=o?{}:e.Symbol||{});"_"==t.charAt(0)||t in n||c(n,t,{value:u.f(t)})}},{151:151,52:52,70:70,89:89,99:99}],151:[function(t,n,r){r.f=t(152)},{152:152}],152:[function(t,n,r){var e=t(126)("wks"),i=t(147),o=t(70).Symbol,u="function"==typeof o;(n.exports=function(t){return e[t]||(e[t]=u&&o[t]||(u?o:i)("Symbol."+t))}).store=e},{126:126,147:147,70:70}],153:[function(t,n,r){var e=t(47),i=t(152)("iterator"),o=t(88);n.exports=t(52).getIteratorMethod=function(t){if(null!=t)return t[i]||t["@@iterator"]||o[e(t)]}},{152:152,47:47,52:52,88:88}],154:[function(t,n,r){var e=t(62);e(e.P,"Array",{copyWithin:t(39)}),t(35)("copyWithin")},{35:35,39:39,62:62}],155:[function(t,n,r){"use strict";var e=t(62),i=t(42)(4);e(e.P+e.F*!t(128)([].every,!0),"Array",{every:function every(t){return i(this,t,arguments[1])}})},{128:128,42:42,62:62}],156:[function(t,n,r){var e=t(62);e(e.P,"Array",{fill:t(40)}),t(35)("fill")},{35:35,40:40,62:62}],157:[function(t,n,r){"use strict";var e=t(62),i=t(42)(2);e(e.P+e.F*!t(128)([].filter,!0),"Array",{filter:function filter(t){return i(this,t,arguments[1])}})},{128:128,42:42,62:62}],158:[function(t,n,r){"use strict";var e=t(62),i=t(42)(6),o="findIndex",u=!0;o in[]&&Array(1)[o](function(){u=!1}),e(e.P+e.F*u,"Array",{findIndex:function findIndex(t){return i(this,t,1<arguments.length?arguments[1]:void 0)}}),t(35)(o)},{35:35,42:42,62:62}],159:[function(t,n,r){"use strict";var e=t(62),i=t(42)(5),o="find",u=!0;o in[]&&Array(1)[o](function(){u=!1}),e(e.P+e.F*u,"Array",{find:function find(t){return i(this,t,1<arguments.length?arguments[1]:void 0)}}),t(35)(o)},{35:35,42:42,62:62}],160:[function(t,n,r){"use strict";var e=t(62),i=t(42)(0),o=t(128)([].forEach,!0);e(e.P+e.F*!o,"Array",{forEach:function forEach(t){return i(this,t,arguments[1])}})},{128:128,42:42,62:62}],161:[function(t,n,r){"use strict";var h=t(54),e=t(62),p=t(142),v=t(83),g=t(78),y=t(141),d=t(53),x=t(153);e(e.S+e.F*!t(86)(function(t){Array.from(t)}),"Array",{from:function from(t){var n,r,e,i,o=p(t),u="function"==typeof this?this:Array,c=arguments.length,a=1<c?arguments[1]:void 0,f=void 0!==a,s=0,l=x(o);if(f&&(a=h(a,2<c?arguments[2]:void 0,2)),null==l||u==Array&&g(l))for(r=new u(n=y(o.length));s<n;s++)d(r,s,f?a(o[s],s):o[s]);else for(i=l.call(o),r=new u;!(e=i.next()).done;s++)d(r,s,f?v(i,a,[e.value,s],!0):e.value);return r.length=s,r}})},{141:141,142:142,153:153,53:53,54:54,62:62,78:78,83:83,86:86}],162:[function(t,n,r){"use strict";var e=t(62),i=t(41)(!1),o=[].indexOf,u=!!o&&1/[1].indexOf(1,-0)<0;e(e.P+e.F*(u||!t(128)(o)),"Array",{indexOf:function indexOf(t){return u?o.apply(this,arguments)||0:i(this,t,arguments[1])}})},{128:128,41:41,62:62}],163:[function(t,n,r){var e=t(62);e(e.S,"Array",{isArray:t(79)})},{62:62,79:79}],164:[function(t,n,r){"use strict";var e=t(35),i=t(87),o=t(88),u=t(140);n.exports=t(85)(Array,"Array",function(t,n){this._t=u(t),this._i=0,this._k=n},function(){var t=this._t,n=this._k,r=this._i++;return!t||r>=t.length?(this._t=void 0,i(1)):i(0,"keys"==n?r:"values"==n?t[r]:[r,t[r]])},"values"),o.Arguments=o.Array,e("keys"),e("values"),e("entries")},{140:140,35:35,85:85,87:87,88:88}],165:[function(t,n,r){"use strict";var e=t(62),i=t(140),o=[].join;e(e.P+e.F*(t(77)!=Object||!t(128)(o)),"Array",{join:function join(t){return o.call(i(this),void 0===t?",":t)}})},{128:128,140:140,62:62,77:77}],166:[function(t,n,r){"use strict";var e=t(62),i=t(140),o=t(139),u=t(141),c=[].lastIndexOf,a=!!c&&1/[1].lastIndexOf(1,-0)<0;e(e.P+e.F*(a||!t(128)(c)),"Array",{lastIndexOf:function lastIndexOf(t){if(a)return c.apply(this,arguments)||0;var n=i(this),r=u(n.length),e=r-1;for(1<arguments.length&&(e=Math.min(e,o(arguments[1]))),e<0&&(e=r+e);0<=e;e--)if(e in n&&n[e]===t)return e||0;return-1}})},{128:128,139:139,140:140,141:141,62:62}],167:[function(t,n,r){"use strict";var e=t(62),i=t(42)(1);e(e.P+e.F*!t(128)([].map,!0),"Array",{map:function map(t){return i(this,t,arguments[1])}})},{128:128,42:42,62:62}],168:[function(t,n,r){"use strict";var e=t(62),i=t(53);e(e.S+e.F*t(64)(function(){function F(){}return!(Array.of.call(F)instanceof F)}),"Array",{of:function of(){for(var t=0,n=arguments.length,r=new("function"==typeof this?this:Array)(n);t<n;)i(r,t,arguments[t++]);return r.length=n,r}})},{53:53,62:62,64:64}],169:[function(t,n,r){"use strict";var e=t(62),i=t(43);e(e.P+e.F*!t(128)([].reduceRight,!0),"Array",{reduceRight:function reduceRight(t){return i(this,t,arguments.length,arguments[1],!0)}})},{128:128,43:43,62:62}],170:[function(t,n,r){"use strict";var e=t(62),i=t(43);e(e.P+e.F*!t(128)([].reduce,!0),"Array",{reduce:function reduce(t){return i(this,t,arguments.length,arguments[1],!1)}})},{128:128,43:43,62:62}],171:[function(t,n,r){"use strict";var e=t(62),i=t(73),f=t(48),s=t(137),l=t(141),h=[].slice;e(e.P+e.F*t(64)(function(){i&&h.call(i)}),"Array",{slice:function slice(t,n){var r=l(this.length),e=f(this);if(n=void 0===n?r:n,"Array"==e)return h.call(this,t,n);for(var i=s(t,r),o=s(n,r),u=l(o-i),c=new Array(u),a=0;a<u;a++)c[a]="String"==e?this.charAt(i+a):this[i+a];return c}})},{137:137,141:141,48:48,62:62,64:64,73:73}],172:[function(t,n,r){"use strict";var e=t(62),i=t(42)(3);e(e.P+e.F*!t(128)([].some,!0),"Array",{some:function some(t){return i(this,t,arguments[1])}})},{128:128,42:42,62:62}],173:[function(t,n,r){"use strict";var e=t(62),i=t(33),o=t(142),u=t(64),c=[].sort,a=[1,2,3];e(e.P+e.F*(u(function(){a.sort(void 0)})||!u(function(){a.sort(null)})||!t(128)(c)),"Array",{sort:function sort(t){return void 0===t?c.call(o(this)):c.call(o(this),i(t))}})},{128:128,142:142,33:33,62:62,64:64}],174:[function(t,n,r){t(123)("Array")},{123:123}],175:[function(t,n,r){var e=t(62);e(e.S,"Date",{now:function(){return(new Date).getTime()}})},{62:62}],176:[function(t,n,r){var e=t(62),i=t(55);e(e.P+e.F*(Date.prototype.toISOString!==i),"Date",{toISOString:i})},{55:55,62:62}],177:[function(t,n,r){"use strict";var e=t(62),i=t(142),o=t(143);e(e.P+e.F*t(64)(function(){return null!==new Date(NaN).toJSON()||1!==Date.prototype.toJSON.call({toISOString:function(){return 1}})}),"Date",{toJSON:function toJSON(t){var n=i(this),r=o(n);return"number"!=typeof r||isFinite(r)?n.toISOString():null}})},{142:142,143:143,62:62,64:64}],178:[function(t,n,r){var e=t(152)("toPrimitive"),i=Date.prototype;e in i||t(72)(i,e,t(56))},{152:152,56:56,72:72}],179:[function(t,n,r){var e=Date.prototype,i="Invalid Date",o="toString",u=e[o],c=e.getTime;new Date(NaN)+""!=i&&t(118)(e,o,function toString(){var t=c.call(this);return t==t?u.call(this):i})},{118:118}],180:[function(t,n,r){var e=t(62);e(e.P,"Function",{bind:t(46)})},{46:46,62:62}],181:[function(t,n,r){"use strict";var e=t(81),i=t(105),o=t(152)("hasInstance"),u=Function.prototype;o in u||t(99).f(u,o,{value:function(t){if("function"!=typeof this||!e(t))return!1;if(!e(this.prototype))return t instanceof this;for(;t=i(t);)if(this.prototype===t)return!0;return!1}})},{105:105,152:152,81:81,99:99}],182:[function(t,n,r){var e=t(99).f,i=Function.prototype,o=/^\s*function ([^ (]*)/;"name"in i||t(58)&&e(i,"name",{configurable:!0,get:function(){try{return(""+this).match(o)[1]}catch(t){return""}}})},{58:58,99:99}],183:[function(t,n,r){"use strict";var e=t(49),i=t(149);n.exports=t(51)("Map",function(t){return function Map(){return t(this,0<arguments.length?arguments[0]:void 0)}},{get:function get(t){var n=e.getEntry(i(this,"Map"),t);return n&&n.v},set:function set(t,n){return e.def(i(this,"Map"),0===t?0:t,n)}},e,!0)},{149:149,49:49,51:51}],184:[function(t,n,r){var e=t(62),i=t(92),o=Math.sqrt,u=Math.acosh;e(e.S+e.F*!(u&&710==Math.floor(u(Number.MAX_VALUE))&&u(1/0)==1/0),"Math",{acosh:function acosh(t){return(t=+t)<1?NaN:94906265.62425156<t?Math.log(t)+Math.LN2:i(t-1+o(t-1)*o(t+1))}})},{62:62,92:92}],185:[function(t,n,r){var e=t(62),i=Math.asinh;e(e.S+e.F*!(i&&0<1/i(0)),"Math",{asinh:function asinh(t){return isFinite(t=+t)&&0!=t?t<0?-asinh(-t):Math.log(t+Math.sqrt(t*t+1)):t}})},{62:62}],186:[function(t,n,r){var e=t(62),i=Math.atanh;e(e.S+e.F*!(i&&1/i(-0)<0),"Math",{atanh:function atanh(t){return 0==(t=+t)?t:Math.log((1+t)/(1-t))/2}})},{62:62}],187:[function(t,n,r){var e=t(62),i=t(93);e(e.S,"Math",{cbrt:function cbrt(t){return i(t=+t)*Math.pow(Math.abs(t),1/3)}})},{62:62,93:93}],188:[function(t,n,r){var e=t(62);e(e.S,"Math",{clz32:function clz32(t){return(t>>>=0)?31-Math.floor(Math.log(t+.5)*Math.LOG2E):32}})},{62:62}],189:[function(t,n,r){var e=t(62),i=Math.exp;e(e.S,"Math",{cosh:function cosh(t){return(i(t=+t)+i(-t))/2}})},{62:62}],190:[function(t,n,r){var e=t(62),i=t(90);e(e.S+e.F*(i!=Math.expm1),"Math",{expm1:i})},{62:62,90:90}],191:[function(t,n,r){var e=t(62);e(e.S,"Math",{fround:t(91)})},{62:62,91:91}],192:[function(t,n,r){var e=t(62),a=Math.abs;e(e.S,"Math",{hypot:function hypot(t,n){for(var r,e,i=0,o=0,u=arguments.length,c=0;o<u;)c<(r=a(arguments[o++]))?(i=i*(e=c/r)*e+1,c=r):i+=0<r?(e=r/c)*e:r;return c===1/0?1/0:c*Math.sqrt(i)}})},{62:62}],193:[function(t,n,r){var e=t(62),i=Math.imul;e(e.S+e.F*t(64)(function(){return-5!=i(4294967295,5)||2!=i.length}),"Math",{imul:function imul(t,n){var r=65535,e=+t,i=+n,o=r&e,u=r&i;return 0|o*u+((r&e>>>16)*u+o*(r&i>>>16)<<16>>>0)}})},{62:62,64:64}],194:[function(t,n,r){var e=t(62);e(e.S,"Math",{log10:function log10(t){return Math.log(t)*Math.LOG10E}})},{62:62}],195:[function(t,n,r){var e=t(62);e(e.S,"Math",{log1p:t(92)})},{62:62,92:92}],196:[function(t,n,r){var e=t(62);e(e.S,"Math",{log2:function log2(t){return Math.log(t)/Math.LN2}})},{62:62}],197:[function(t,n,r){var e=t(62);e(e.S,"Math",{sign:t(93)})},{62:62,93:93}],198:[function(t,n,r){var e=t(62),i=t(90),o=Math.exp;e(e.S+e.F*t(64)(function(){return-2e-17!=!Math.sinh(-2e-17)}),"Math",{sinh:function sinh(t){return Math.abs(t=+t)<1?(i(t)-i(-t))/2:(o(t-1)-o(-t-1))*(Math.E/2)}})},{62:62,64:64,90:90}],199:[function(t,n,r){var e=t(62),i=t(90),o=Math.exp;e(e.S,"Math",{tanh:function tanh(t){var n=i(t=+t),r=i(-t);return n==1/0?1:r==1/0?-1:(n-r)/(o(t)+o(-t))}})},{62:62,90:90}],200:[function(t,n,r){var e=t(62);e(e.S,"Math",{trunc:function trunc(t){return(0<t?Math.floor:Math.ceil)(t)}})},{62:62}],201:[function(t,n,r){"use strict";function EN(t){var n=s(t,!1);if("string"==typeof n&&2<n.length){var r,e,i,o=(n=x?n.trim():h(n,3)).charCodeAt(0);if(43===o||45===o){if(88===(r=n.charCodeAt(2))||120===r)return NaN}else if(48===o){switch(n.charCodeAt(1)){case 66:case 98:e=2,i=49;break;case 79:case 111:e=8,i=55;break;default:return+n}for(var u,c=n.slice(2),a=0,f=c.length;a<f;a++)if((u=c.charCodeAt(a))<48||i<u)return NaN;return parseInt(c,e)}}return+n}var e=t(70),i=t(71),o=t(48),u=t(75),s=t(143),c=t(64),a=t(103).f,f=t(101).f,l=t(99).f,h=t(134).trim,p="Number",v=e[p],g=v,y=v.prototype,d=o(t(98)(y))==p,x="trim"in String.prototype;if(!v(" 0o1")||!v("0b1")||v("+0x1")){v=function Number(t){var n=arguments.length<1?0:t,r=this;return r instanceof v&&(d?c(function(){y.valueOf.call(r)}):o(r)!=p)?u(new g(EN(n)),r,v):EN(n)};for(var m,S=t(58)?a(g):"MAX_VALUE,MIN_VALUE,NaN,NEGATIVE_INFINITY,POSITIVE_INFINITY,EPSILON,isFinite,isInteger,isNaN,isSafeInteger,MAX_SAFE_INTEGER,MIN_SAFE_INTEGER,parseFloat,parseInt,isInteger".split(","),b=0;S.length>b;b++)i(g,m=S[b])&&!i(v,m)&&l(v,m,f(g,m));(v.prototype=y).constructor=v,t(118)(e,p,v)}},{101:101,103:103,118:118,134:134,143:143,48:48,58:58,64:64,70:70,71:71,75:75,98:98,99:99}],202:[function(t,n,r){var e=t(62);e(e.S,"Number",{EPSILON:Math.pow(2,-52)})},{62:62}],203:[function(t,n,r){var e=t(62),i=t(70).isFinite;e(e.S,"Number",{isFinite:function isFinite(t){return"number"==typeof t&&i(t)}})},{62:62,70:70}],204:[function(t,n,r){var e=t(62);e(e.S,"Number",{isInteger:t(80)})},{62:62,80:80}],205:[function(t,n,r){var e=t(62);e(e.S,"Number",{isNaN:function isNaN(t){return t!=t}})},{62:62}],206:[function(t,n,r){var e=t(62),i=t(80),o=Math.abs;e(e.S,"Number",{isSafeInteger:function isSafeInteger(t){return i(t)&&o(t)<=9007199254740991}})},{62:62,80:80}],207:[function(t,n,r){var e=t(62);e(e.S,"Number",{MAX_SAFE_INTEGER:9007199254740991})},{62:62}],208:[function(t,n,r){var e=t(62);e(e.S,"Number",{MIN_SAFE_INTEGER:-9007199254740991})},{62:62}],209:[function(t,n,r){var e=t(62),i=t(112);e(e.S+e.F*(Number.parseFloat!=i),"Number",{parseFloat:i})},{112:112,62:62}],210:[function(t,n,r){var e=t(62),i=t(113);e(e.S+e.F*(Number.parseInt!=i),"Number",{parseInt:i})},{113:113,62:62}],211:[function(t,n,r){"use strict";function XO(t,n){for(var r=-1,e=n;++r<6;)e+=t*u[r],u[r]=e%1e7,e=o(e/1e7)}function YO(t){for(var n=6,r=0;0<=--n;)r+=u[n],u[n]=o(r/t),r=r%t*1e7}function ZO(){for(var t=6,n="";0<=--t;)if(""!==n||0===t||0!==u[t]){var r=String(u[t]);n=""===n?r:n+l.call("0",7-r.length)+r}return n}var e=t(62),f=t(139),s=t(34),l=t(133),i=1..toFixed,o=Math.floor,u=[0,0,0,0,0,0],h="Number.toFixed: incorrect invocation!",p=function(t,n,r){return 0===n?r:n%2==1?p(t,n-1,r*t):p(t*t,n/2,r)};e(e.P+e.F*(!!i&&("0.000"!==8e-5.toFixed(3)||"1"!==.9.toFixed(0)||"1.25"!==1.255.toFixed(2)||"1000000000000000128"!==(0xde0b6b3a7640080).toFixed(0))||!t(64)(function(){i.call({})})),"Number",{toFixed:function toFixed(t){var n,r,e,i,o=s(this,h),u=f(t),c="",a="0";if(u<0||20<u)throw RangeError(h);if(o!=o)return"NaN";if(o<=-1e21||1e21<=o)return String(o);if(o<0&&(c="-",o=-o),1e-21<o)if(r=(n=function(t){for(var n=0,r=t;4096<=r;)n+=12,r/=4096;for(;2<=r;)n+=1,r/=2;return n}(o*p(2,69,1))-69)<0?o*p(2,-n,1):o/p(2,n,1),r*=4503599627370496,0<(n=52-n)){for(XO(0,r),e=u;7<=e;)XO(1e7,0),e-=7;for(XO(p(10,e,1),0),e=n-1;23<=e;)YO(1<<23),e-=23;YO(1<<e),XO(1,1),YO(2),a=ZO()}else XO(0,r),XO(1<<-n,0),a=ZO()+l.call("0",u);return a=0<u?c+((i=a.length)<=u?"0."+l.call("0",u-i)+a:a.slice(0,i-u)+"."+a.slice(i-u)):c+a}})},{133:133,139:139,34:34,62:62,64:64}],212:[function(t,n,r){"use strict";var e=t(62),i=t(64),o=t(34),u=1..toPrecision;e(e.P+e.F*(i(function(){return"1"!==u.call(1,void 0)})||!i(function(){u.call({})})),"Number",{toPrecision:function toPrecision(t){var n=o(this,"Number#toPrecision: incorrect invocation!");return void 0===t?u.call(n):u.call(n,t)}})},{34:34,62:62,64:64}],213:[function(t,n,r){var e=t(62);e(e.S+e.F,"Object",{assign:t(97)})},{62:62,97:97}],214:[function(t,n,r){var e=t(62);e(e.S,"Object",{create:t(98)})},{62:62,98:98}],215:[function(t,n,r){var e=t(62);e(e.S+e.F*!t(58),"Object",{defineProperties:t(100)})},{100:100,58:58,62:62}],216:[function(t,n,r){var e=t(62);e(e.S+e.F*!t(58),"Object",{defineProperty:t(99).f})},{58:58,62:62,99:99}],217:[function(t,n,r){var e=t(81),i=t(94).onFreeze;t(109)("freeze",function(n){return function freeze(t){return n&&e(t)?n(i(t)):t}})},{109:109,81:81,94:94}],218:[function(t,n,r){var e=t(140),i=t(101).f;t(109)("getOwnPropertyDescriptor",function(){return function getOwnPropertyDescriptor(t,n){return i(e(t),n)}})},{101:101,109:109,140:140}],219:[function(t,n,r){t(109)("getOwnPropertyNames",function(){return t(102).f})},{102:102,109:109}],220:[function(t,n,r){var e=t(142),i=t(105);t(109)("getPrototypeOf",function(){return function getPrototypeOf(t){return i(e(t))}})},{105:105,109:109,142:142}],221:[function(t,n,r){var e=t(81);t(109)("isExtensible",function(n){return function isExtensible(t){return!!e(t)&&(!n||n(t))}})},{109:109,81:81}],222:[function(t,n,r){var e=t(81);t(109)("isFrozen",function(n){return function isFrozen(t){return!e(t)||!!n&&n(t)}})},{109:109,81:81}],223:[function(t,n,r){var e=t(81);t(109)("isSealed",function(n){return function isSealed(t){return!e(t)||!!n&&n(t)}})},{109:109,81:81}],224:[function(t,n,r){var e=t(62);e(e.S,"Object",{is:t(121)})},{121:121,62:62}],225:[function(t,n,r){var e=t(142),i=t(107);t(109)("keys",function(){return function keys(t){return i(e(t))}})},{107:107,109:109,142:142}],226:[function(t,n,r){var e=t(81),i=t(94).onFreeze;t(109)("preventExtensions",function(n){return function preventExtensions(t){return n&&e(t)?n(i(t)):t}})},{109:109,81:81,94:94}],227:[function(t,n,r){var e=t(81),i=t(94).onFreeze;t(109)("seal",function(n){return function seal(t){return n&&e(t)?n(i(t)):t}})},{109:109,81:81,94:94}],228:[function(t,n,r){var e=t(62);e(e.S,"Object",{setPrototypeOf:t(122).set})},{122:122,62:62}],229:[function(t,n,r){"use strict";var e=t(47),i={};i[t(152)("toStringTag")]="z",i+""!="[object z]"&&t(118)(Object.prototype,"toString",function toString(){return"[object "+e(this)+"]"},!0)},{118:118,152:152,47:47}],230:[function(t,n,r){var e=t(62),i=t(112);e(e.G+e.F*(parseFloat!=i),{parseFloat:i})},{112:112,62:62}],231:[function(t,n,r){var e=t(62),i=t(113);e(e.G+e.F*(parseInt!=i),{parseInt:i})},{113:113,62:62}],232:[function(r,t,n){"use strict";function $R(){}function fS(t){var n;return!(!h(t)||"function"!=typeof(n=t.then))&&n}function gS(s,r){if(!s._n){s._n=!0;var e=s._c;x(function(){for(var a=s._v,f=1==s._s,t=0,n=function(t){var n,r,e,i=f?t.ok:t.fail,o=t.resolve,u=t.reject,c=t.domain;try{i?(f||(2==s._h&&R(s),s._h=1),!0===i?n=a:(c&&c.enter(),n=i(a),c&&(c.exit(),e=!0)),n===t.promise?u(E("Promise-chain cycle")):(r=fS(n))?r.call(n,o,u):o(n)):u(a)}catch(t){c&&!e&&c.exit(),u(t)}};e.length>t;)n(e[t++]);s._c=[],s._n=!1,r&&!s._h&&N(s)})}}function kS(t){var n=this;n._d||(n._d=!0,(n=n._w||n)._v=t,n._s=2,n._a||(n._a=n._c.slice()),gS(n,!0))}var e,i,o,u,c=r(89),a=r(70),f=r(54),s=r(47),l=r(62),h=r(81),p=r(33),v=r(37),g=r(68),y=r(127),d=r(136).set,x=r(95)(),m=r(96),S=r(114),b=r(148),w=r(115),_="Promise",E=a.TypeError,O=a.process,F=O&&O.versions,I=F&&F.v8||"",P=a[_],A="process"==s(O),M=i=m.f,k=!!function(){try{var t=P.resolve(1),n=(t.constructor={})[r(152)("species")]=function(t){t($R,$R)};return(A||"function"==typeof PromiseRejectionEvent)&&t.then($R)instanceof n&&0!==I.indexOf("6.6")&&-1===b.indexOf("Chrome/66")}catch(t){}}(),N=function(o){d.call(a,function(){var t,n,r,e=o._v,i=j(o);if(i&&(t=S(function(){A?O.emit("unhandledRejection",e,o):(n=a.onunhandledrejection)?n({promise:o,reason:e}):(r=a.console)&&r.error&&r.error("Unhandled promise rejection",e)}),o._h=A||j(o)?2:1),o._a=void 0,i&&t.e)throw t.v})},j=function(t){return 1!==t._h&&0===(t._a||t._c).length},R=function(n){d.call(a,function(){var t;A?O.emit("rejectionHandled",n):(t=a.onrejectionhandled)&&t({promise:n,reason:n._v})})},T=function(t){var r,e=this;if(!e._d){e._d=!0,e=e._w||e;try{if(e===t)throw E("Promise can't be resolved itself");(r=fS(t))?x(function(){var n={_w:e,_d:!1};try{r.call(t,f(T,n,1),f(kS,n,1))}catch(t){kS.call(n,t)}}):(e._v=t,e._s=1,gS(e,!1))}catch(t){kS.call({_w:e,_d:!1},t)}}};k||(P=function Promise(t){v(this,P,_,"_h"),p(t),e.call(this);try{t(f(T,this,1),f(kS,this,1))}catch(t){kS.call(this,t)}},(e=function Promise(t){this._c=[],this._a=void 0,this._s=0,this._d=!1,this._v=void 0,this._h=0,this._n=!1}).prototype=r(117)(P.prototype,{then:function then(t,n){var r=M(y(this,P));return r.ok="function"!=typeof t||t,r.fail="function"==typeof n&&n,r.domain=A?O.domain:void 0,this._c.push(r),this._a&&this._a.push(r),this._s&&gS(this,!1),r.promise},catch:function(t){return this.then(void 0,t)}}),o=function(){var t=new e;this.promise=t,this.resolve=f(T,t,1),this.reject=f(kS,t,1)},m.f=M=function(t){return t===P||t===u?new o(t):i(t)}),l(l.G+l.W+l.F*!k,{Promise:P}),r(124)(P,_),r(123)(_),u=r(52)[_],l(l.S+l.F*!k,_,{reject:function reject(t){var n=M(this);return(0,n.reject)(t),n.promise}}),l(l.S+l.F*(c||!k),_,{resolve:function resolve(t){return w(c&&this===u?P:this,t)}}),l(l.S+l.F*!(k&&r(86)(function(t){P.all(t).catch($R)})),_,{all:function all(t){var u=this,n=M(u),c=n.resolve,a=n.reject,r=S(function(){var e=[],i=0,o=1;g(t,!1,function(t){var n=i++,r=!1;e.push(void 0),o++,u.resolve(t).then(function(t){r||(r=!0,e[n]=t,--o||c(e))},a)}),--o||c(e)});return r.e&&a(r.v),n.promise},race:function race(t){var n=this,r=M(n),e=r.reject,i=S(function(){g(t,!1,function(t){n.resolve(t).then(r.resolve,e)})});return i.e&&e(i.v),r.promise}})},{114:114,115:115,117:117,123:123,124:124,127:127,136:136,148:148,152:152,33:33,37:37,47:47,52:52,54:54,62:62,68:68,70:70,81:81,86:86,89:89,95:95,96:96}],233:[function(t,n,r){var e=t(62),o=t(33),u=t(38),c=(t(70).Reflect||{}).apply,a=Function.apply;e(e.S+e.F*!t(64)(function(){c(function(){})}),"Reflect",{apply:function apply(t,n,r){var e=o(t),i=u(r);return c?c(e,n,i):a.call(e,n,i)}})},{33:33,38:38,62:62,64:64,70:70}],234:[function(t,n,r){var e=t(62),c=t(98),a=t(33),f=t(38),s=t(81),i=t(64),l=t(46),h=(t(70).Reflect||{}).construct,p=i(function(){function F(){}return!(h(function(){},[],F)instanceof F)}),v=!i(function(){h(function(){})});e(e.S+e.F*(p||v),"Reflect",{construct:function construct(t,n){a(t),f(n);var r=arguments.length<3?t:a(arguments[2]);if(v&&!p)return h(t,n,r);if(t==r){switch(n.length){case 0:return new t;case 1:return new t(n[0]);case 2:return new t(n[0],n[1]);case 3:return new t(n[0],n[1],n[2]);case 4:return new t(n[0],n[1],n[2],n[3])}var e=[null];return e.push.apply(e,n),new(l.apply(t,e))}var i=r.prototype,o=c(s(i)?i:Object.prototype),u=Function.apply.call(t,o,n);return s(u)?u:o}})},{33:33,38:38,46:46,62:62,64:64,70:70,81:81,98:98}],235:[function(t,n,r){var e=t(99),i=t(62),o=t(38),u=t(143);i(i.S+i.F*t(64)(function(){Reflect.defineProperty(e.f({},1,{value:1}),1,{value:2})}),"Reflect",{defineProperty:function defineProperty(t,n,r){o(t),n=u(n,!0),o(r);try{return e.f(t,n,r),!0}catch(t){return!1}}})},{143:143,38:38,62:62,64:64,99:99}],236:[function(t,n,r){var e=t(62),i=t(101).f,o=t(38);e(e.S,"Reflect",{deleteProperty:function deleteProperty(t,n){var r=i(o(t),n);return!(r&&!r.configurable)&&delete t[n]}})},{101:101,38:38,62:62}],237:[function(t,n,r){"use strict";function IU(t){this._t=i(t),this._i=0;var n,r=this._k=[];for(n in t)r.push(n)}var e=t(62),i=t(38);t(84)(IU,"Object",function(){var t,n=this._k;do{if(this._i>=n.length)return{value:void 0,done:!0}}while(!((t=n[this._i++])in this._t));return{value:t,done:!1}}),e(e.S,"Reflect",{enumerate:function enumerate(t){return new IU(t)}})},{38:38,62:62,84:84}],238:[function(t,n,r){var e=t(101),i=t(62),o=t(38);i(i.S,"Reflect",{getOwnPropertyDescriptor:function getOwnPropertyDescriptor(t,n){return e.f(o(t),n)}})},{101:101,38:38,62:62}],239:[function(t,n,r){var e=t(62),i=t(105),o=t(38);e(e.S,"Reflect",{getPrototypeOf:function getPrototypeOf(t){return i(o(t))}})},{105:105,38:38,62:62}],240:[function(t,n,r){var o=t(101),u=t(105),c=t(71),e=t(62),a=t(81),f=t(38);e(e.S,"Reflect",{get:function get(t,n){var r,e,i=arguments.length<3?t:arguments[2];return f(t)===i?t[n]:(r=o.f(t,n))?c(r,"value")?r.value:void 0!==r.get?r.get.call(i):void 0:a(e=u(t))?get(e,n,i):void 0}})},{101:101,105:105,38:38,62:62,71:71,81:81}],241:[function(t,n,r){var e=t(62);e(e.S,"Reflect",{has:function has(t,n){return n in t}})},{62:62}],242:[function(t,n,r){var e=t(62),i=t(38),o=Object.isExtensible;e(e.S,"Reflect",{isExtensible:function isExtensible(t){return i(t),!o||o(t)}})},{38:38,62:62}],243:[function(t,n,r){var e=t(62);e(e.S,"Reflect",{ownKeys:t(111)})},{111:111,62:62}],244:[function(t,n,r){var e=t(62),i=t(38),o=Object.preventExtensions;e(e.S,"Reflect",{preventExtensions:function preventExtensions(t){i(t);try{return o&&o(t),!0}catch(t){return!1}}})},{38:38,62:62}],245:[function(t,n,r){var e=t(62),i=t(122);i&&e(e.S,"Reflect",{setPrototypeOf:function setPrototypeOf(t,n){i.check(t,n);try{return i.set(t,n),!0}catch(t){return!1}}})},{122:122,62:62}],246:[function(t,n,r){var c=t(99),a=t(101),f=t(105),s=t(71),e=t(62),l=t(116),h=t(38),p=t(81);e(e.S,"Reflect",{set:function set(t,n,r){var e,i,o=arguments.length<4?t:arguments[3],u=a.f(h(t),n);if(!u){if(p(i=f(t)))return set(i,n,r,o);u=l(0)}if(s(u,"value")){if(!1===u.writable||!p(o))return!1;if(e=a.f(o,n)){if(e.get||e.set||!1===e.writable)return!1;e.value=r,c.f(o,n,e)}else c.f(o,n,l(0,r));return!0}return void 0!==u.set&&(u.set.call(o,r),!0)}})},{101:101,105:105,116:116,38:38,62:62,71:71,81:81,99:99}],247:[function(t,n,r){var e=t(70),o=t(75),i=t(99).f,u=t(103).f,c=t(82),a=t(66),f=e.RegExp,s=f,l=f.prototype,h=/a/g,p=/a/g,v=new f(h)!==h;if(t(58)&&(!v||t(64)(function(){return p[t(152)("match")]=!1,f(h)!=h||f(p)==p||"/a/i"!=f(h,"i")}))){f=function RegExp(t,n){var r=this instanceof f,e=c(t),i=void 0===n;return!r&&e&&t.constructor===f&&i?t:o(v?new s(e&&!i?t.source:t,n):s((e=t instanceof f)?t.source:t,e&&i?a.call(t):n),r?this:l,f)};function DW(n){n in f||i(f,n,{configurable:!0,get:function(){return s[n]},set:function(t){s[n]=t}})}for(var g=u(s),y=0;g.length>y;)DW(g[y++]);(l.constructor=f).prototype=l,t(118)(e,"RegExp",f)}t(123)("RegExp")},{103:103,118:118,123:123,152:152,58:58,64:64,66:66,70:70,75:75,82:82,99:99}],248:[function(t,n,r){"use strict";var e=t(120);t(62)({target:"RegExp",proto:!0,forced:e!==/./.exec},{exec:e})},{120:120,62:62}],249:[function(t,n,r){t(58)&&"g"!=/./g.flags&&t(99).f(RegExp.prototype,"flags",{configurable:!0,get:t(66)})},{58:58,66:66,99:99}],250:[function(t,n,r){"use strict";var l=t(38),h=t(141),p=t(36),v=t(119);t(65)("match",1,function(e,i,f,s){return[function match(t){var n=e(this),r=null==t?void 0:t[i];return void 0!==r?r.call(t,n):new RegExp(t)[i](String(n))},function(t){var n=s(f,t,this);if(n.done)return n.value;var r=l(t),e=String(this);if(!r.global)return v(r,e);for(var i,o=r.unicode,u=[],c=r.lastIndex=0;null!==(i=v(r,e));){var a=String(i[0]);""===(u[c]=a)&&(r.lastIndex=p(e,h(r.lastIndex),o)),c++}return 0===c?null:u}]})},{119:119,141:141,36:36,38:38,65:65}],251:[function(t,n,r){"use strict";var _=t(38),e=t(142),E=t(141),O=t(139),F=t(36),I=t(119),P=Math.max,A=Math.min,h=Math.floor,p=/\$([$&`']|\d\d?|<[^>]*>)/g,v=/\$([$&`']|\d\d?)/g;t(65)("replace",2,function(i,o,b,w){return[function replace(t,n){var r=i(this),e=null==t?void 0:t[o];return void 0!==e?e.call(t,r,n):b.call(String(r),t,n)},function(t,n){var r=w(b,t,this,n);if(r.done)return r.value;var e=_(t),i=String(this),o="function"==typeof n;o||(n=String(n));var u=e.global;if(u){var c=e.unicode;e.lastIndex=0}for(var a=[];;){var f=I(e,i);if(null===f)break;if(a.push(f),!u)break;""===String(f[0])&&(e.lastIndex=F(i,E(e.lastIndex),c))}for(var s,l="",h=0,p=0;p<a.length;p++){f=a[p];for(var v=String(f[0]),g=P(A(O(f.index),i.length),0),y=[],d=1;d<f.length;d++)y.push(void 0===(s=f[d])?s:String(s));var x=f.groups;if(o){var m=[v].concat(y,g,i);void 0!==x&&m.push(x);var S=String(n.apply(void 0,m))}else S=getSubstitution(v,i,g,y,x,n);h<=g&&(l+=i.slice(h,g)+S,h=g+v.length)}return l+i.slice(h)}];function getSubstitution(o,u,c,a,f,t){var s=c+o.length,l=a.length,n=v;return void 0!==f&&(f=e(f),n=p),b.call(t,n,function(t,n){var r;switch(n.charAt(0)){case"$":return"$";case"&":return o;case"`":return u.slice(0,c);case"'":return u.slice(s);case"<":r=f[n.slice(1,-1)];break;default:var e=+n;if(0==e)return t;if(l<e){var i=h(e/10);return 0===i?t:i<=l?void 0===a[i-1]?n.charAt(1):a[i-1]+n.charAt(1):t}r=a[e-1]}return void 0===r?"":r})}})},{119:119,139:139,141:141,142:142,36:36,38:38,65:65}],252:[function(t,n,r){"use strict";var a=t(38),f=t(121),s=t(119);t(65)("search",1,function(e,i,u,c){return[function search(t){var n=e(this),r=null==t?void 0:t[i];return void 0!==r?r.call(t,n):new RegExp(t)[i](String(n))},function(t){var n=c(u,t,this);if(n.done)return n.value;var r=a(t),e=String(this),i=r.lastIndex;f(i,0)||(r.lastIndex=0);var o=s(r,e);return f(r.lastIndex,i)||(r.lastIndex=i),null===o?-1:o.index}]})},{119:119,121:121,38:38,65:65}],253:[function(t,n,r){"use strict";var l=t(82),m=t(38),S=t(127),b=t(36),w=t(141),_=t(119),h=t(120),e=t(64),E=Math.min,p=[].push,u="split",v="length",g="lastIndex",O=4294967295,F=!e(function(){RegExp(O,"y")});t(65)("split",2,function(i,o,y,d){var x;return x="c"=="abbc"[u](/(b)*/)[1]||4!="test"[u](/(?:)/,-1)[v]||2!="ab"[u](/(?:ab)*/)[v]||4!="."[u](/(.?)(.?)/)[v]||1<"."[u](/()()/)[v]||""[u](/.?/)[v]?function(t,n){var r=String(this);if(void 0===t&&0===n)return[];if(!l(t))return y.call(r,t,n);for(var e,i,o,u=[],c=(t.ignoreCase?"i":"")+(t.multiline?"m":"")+(t.unicode?"u":"")+(t.sticky?"y":""),a=0,f=void 0===n?O:n>>>0,s=new RegExp(t.source,c+"g");(e=h.call(s,r))&&!(a<(i=s[g])&&(u.push(r.slice(a,e.index)),1<e[v]&&e.index<r[v]&&p.apply(u,e.slice(1)),o=e[0][v],a=i,u[v]>=f));)s[g]===e.index&&s[g]++;return a===r[v]?!o&&s.test("")||u.push(""):u.push(r.slice(a)),u[v]>f?u.slice(0,f):u}:"0"[u](void 0,0)[v]?function(t,n){return void 0===t&&0===n?[]:y.call(this,t,n)}:y,[function split(t,n){var r=i(this),e=null==t?void 0:t[o];return void 0!==e?e.call(t,r,n):x.call(String(r),t,n)},function(t,n){var r=d(x,t,this,n,x!==y);if(r.done)return r.value;var e=m(t),i=String(this),o=S(e,RegExp),u=e.unicode,c=(e.ignoreCase?"i":"")+(e.multiline?"m":"")+(e.unicode?"u":"")+(F?"y":"g"),a=new o(F?e:"^(?:"+e.source+")",c),f=void 0===n?O:n>>>0;if(0==f)return[];if(0===i.length)return null===_(a,i)?[i]:[];for(var s=0,l=0,h=[];l<i.length;){a.lastIndex=F?l:0;var p,v=_(a,F?i:i.slice(l));if(null===v||(p=E(w(a.lastIndex+(F?0:l)),i.length))===s)l=b(i,l,u);else{if(h.push(i.slice(s,l)),h.length===f)return h;for(var g=1;g<=v.length-1;g++)if(h.push(v[g]),h.length===f)return h;l=s=p}}return h.push(i.slice(s)),h}]})},{119:119,120:120,127:127,141:141,36:36,38:38,64:64,65:65,82:82}],254:[function(n,t,r){"use strict";n(249);function XZ(t){n(118)(RegExp.prototype,u,t,!0)}var e=n(38),i=n(66),o=n(58),u="toString",c=/./[u];n(64)(function(){return"/a/b"!=c.call({source:"a",flags:"b"})})?XZ(function toString(){var t=e(this);return"/".concat(t.source,"/","flags"in t?t.flags:!o&&t instanceof RegExp?i.call(t):void 0)}):c.name!=u&&XZ(function toString(){return c.call(this)})},{118:118,249:249,38:38,58:58,64:64,66:66}],255:[function(t,n,r){"use strict";var e=t(49),i=t(149);n.exports=t(51)("Set",function(t){return function Set(){return t(this,0<arguments.length?arguments[0]:void 0)}},{add:function add(t){return e.def(i(this,"Set"),t=0===t?0:t,t)}},e)},{149:149,49:49,51:51}],256:[function(t,n,r){"use strict";t(131)("anchor",function(n){return function anchor(t){return n(this,"a","name",t)}})},{131:131}],257:[function(t,n,r){"use strict";t(131)("big",function(t){return function big(){return t(this,"big","","")}})},{131:131}],258:[function(t,n,r){"use strict";t(131)("blink",function(t){return function blink(){return t(this,"blink","","")}})},{131:131}],259:[function(t,n,r){"use strict";t(131)("bold",function(t){return function bold(){return t(this,"b","","")}})},{131:131}],260:[function(t,n,r){"use strict";var e=t(62),i=t(129)(!1);e(e.P,"String",{codePointAt:function codePointAt(t){return i(this,t)}})},{129:129,62:62}],261:[function(t,n,r){"use strict";var e=t(62),u=t(141),c=t(130),a="endsWith",f=""[a];e(e.P+e.F*t(63)(a),"String",{endsWith:function endsWith(t){var n=c(this,t,a),r=1<arguments.length?arguments[1]:void 0,e=u(n.length),i=void 0===r?e:Math.min(u(r),e),o=String(t);return f?f.call(n,o,i):n.slice(i-o.length,i)===o}})},{130:130,141:141,62:62,63:63}],262:[function(t,n,r){"use strict";t(131)("fixed",function(t){return function fixed(){return t(this,"tt","","")}})},{131:131}],263:[function(t,n,r){"use strict";t(131)("fontcolor",function(n){return function fontcolor(t){return n(this,"font","color",t)}})},{131:131}],264:[function(t,n,r){"use strict";t(131)("fontsize",function(n){return function fontsize(t){return n(this,"font","size",t)}})},{131:131}],265:[function(t,n,r){var e=t(62),o=t(137),u=String.fromCharCode,i=String.fromCodePoint;e(e.S+e.F*(!!i&&1!=i.length),"String",{fromCodePoint:function fromCodePoint(t){for(var n,r=[],e=arguments.length,i=0;i<e;){if(n=+arguments[i++],o(n,1114111)!==n)throw RangeError(n+" is not a valid code point");r.push(n<65536?u(n):u(55296+((n-=65536)>>10),n%1024+56320))}return r.join("")}})},{137:137,62:62}],266:[function(t,n,r){"use strict";var e=t(62),i=t(130),o="includes";e(e.P+e.F*t(63)(o),"String",{includes:function includes(t){return!!~i(this,t,o).indexOf(t,1<arguments.length?arguments[1]:void 0)}})},{130:130,62:62,63:63}],267:[function(t,n,r){"use strict";t(131)("italics",function(t){return function italics(){return t(this,"i","","")}})},{131:131}],268:[function(t,n,r){"use strict";var e=t(129)(!0);t(85)(String,"String",function(t){this._t=String(t),this._i=0},function(){var t,n=this._t,r=this._i;return r>=n.length?{value:void 0,done:!0}:(t=e(n,r),this._i+=t.length,{value:t,done:!1})})},{129:129,85:85}],269:[function(t,n,r){"use strict";t(131)("link",function(n){return function link(t){return n(this,"a","href",t)}})},{131:131}],270:[function(t,n,r){var e=t(62),u=t(140),c=t(141);e(e.S,"String",{raw:function raw(t){for(var n=u(t.raw),r=c(n.length),e=arguments.length,i=[],o=0;o<r;)i.push(String(n[o++])),o<e&&i.push(String(arguments[o]));return i.join("")}})},{140:140,141:141,62:62}],271:[function(t,n,r){var e=t(62);e(e.P,"String",{repeat:t(133)})},{133:133,62:62}],272:[function(t,n,r){"use strict";t(131)("small",function(t){return function small(){return t(this,"small","","")}})},{131:131}],273:[function(t,n,r){"use strict";var e=t(62),i=t(141),o=t(130),u="startsWith",c=""[u];e(e.P+e.F*t(63)(u),"String",{startsWith:function startsWith(t){var n=o(this,t,u),r=i(Math.min(1<arguments.length?arguments[1]:void 0,n.length)),e=String(t);return c?c.call(n,e,r):n.slice(r,r+e.length)===e}})},{130:130,141:141,62:62,63:63}],274:[function(t,n,r){"use strict";t(131)("strike",function(t){return function strike(){return t(this,"strike","","")}})},{131:131}],275:[function(t,n,r){"use strict";t(131)("sub",function(t){return function sub(){return t(this,"sub","","")}})},{131:131}],276:[function(t,n,r){"use strict";t(131)("sup",function(t){return function sup(){return t(this,"sup","","")}})},{131:131}],277:[function(t,n,r){"use strict";t(134)("trim",function(t){return function trim(){return t(this,3)}})},{134:134}],278:[function(t,n,r){"use strict";function B1(t){var n=W[t]=E(j[L]);return n._k=t,n}function E1(t,n){x(t);for(var r,e=y(n=b(n)),i=0,o=e.length;i<o;)Q(t,r=e[i++],n[r]);return t}function G1(t){var n=D.call(this,t=w(t,!0));return!(this===B&&u(W,t)&&!u(V,t))&&(!(n||!u(this,t)||!u(W,t)||u(this,C)&&this[C][t])||n)}function H1(t,n){if(t=b(t),n=w(n,!0),t!==B||!u(W,n)||u(V,n)){var r=M(t,n);return!r||!u(W,n)||u(t,C)&&t[C][n]||(r.enumerable=!0),r}}function I1(t){for(var n,r=N(b(t)),e=[],i=0;r.length>i;)u(W,n=r[i++])||n==C||n==a||e.push(n);return e}function J1(t){for(var n,r=t===B,e=N(r?V:b(t)),i=[],o=0;e.length>o;)!u(W,n=e[o++])||r&&!u(B,n)||i.push(W[n]);return i}var e=t(70),u=t(71),i=t(58),o=t(62),c=t(118),a=t(94).KEY,f=t(64),s=t(126),l=t(124),h=t(147),p=t(152),v=t(151),g=t(150),y=t(61),d=t(79),x=t(38),m=t(81),S=t(142),b=t(140),w=t(143),_=t(116),E=t(98),O=t(102),F=t(101),I=t(104),P=t(99),A=t(107),M=F.f,k=P.f,N=O.f,j=e.Symbol,R=e.JSON,T=R&&R.stringify,L="prototype",C=p("_hidden"),G=p("toPrimitive"),D={}.propertyIsEnumerable,U=s("symbol-registry"),W=s("symbols"),V=s("op-symbols"),B=Object[L],q="function"==typeof j&&!!I.f,Y=e.QObject,z=!Y||!Y[L]||!Y[L].findChild,X=i&&f(function(){return 7!=E(k({},"a",{get:function(){return k(this,"a",{value:7}).a}})).a})?function(t,n,r){var e=M(B,n);e&&delete B[n],k(t,n,r),e&&t!==B&&k(B,n,e)}:k,$=q&&"symbol"==typeof j.iterator?function(t){return"symbol"==typeof t}:function(t){return t instanceof j},Q=function defineProperty(t,n,r){return t===B&&Q(V,n,r),x(t),n=w(n,!0),x(r),u(W,n)?(r.enumerable?(u(t,C)&&t[C][n]&&(t[C][n]=!1),r=E(r,{enumerable:_(0,!1)})):(u(t,C)||k(t,C,_(1,{})),t[C][n]=!0),X(t,n,r)):k(t,n,r)};q||(c((j=function Symbol(){if(this instanceof j)throw TypeError("Symbol is not a constructor!");var n=h(0<arguments.length?arguments[0]:void 0),r=function(t){this===B&&r.call(V,t),u(this,C)&&u(this[C],n)&&(this[C][n]=!1),X(this,n,_(1,t))};return i&&z&&X(B,n,{configurable:!0,set:r}),B1(n)})[L],"toString",function toString(){return this._k}),F.f=H1,P.f=Q,t(103).f=O.f=I1,t(108).f=G1,I.f=J1,i&&!t(89)&&c(B,"propertyIsEnumerable",G1,!0),v.f=function(t){return B1(p(t))}),o(o.G+o.W+o.F*!q,{Symbol:j});for(var Z="hasInstance,isConcatSpreadable,iterator,match,replace,search,species,split,toPrimitive,toStringTag,unscopables".split(","),J=0;Z.length>J;)p(Z[J++]);for(var H=A(p.store),K=0;H.length>K;)g(H[K++]);o(o.S+o.F*!q,"Symbol",{for:function(t){return u(U,t+="")?U[t]:U[t]=j(t)},keyFor:function keyFor(t){if(!$(t))throw TypeError(t+" is not a symbol!");for(var n in U)if(U[n]===t)return n},useSetter:function(){z=!0},useSimple:function(){z=!1}}),o(o.S+o.F*!q,"Object",{create:function create(t,n){return void 0===n?E(t):E1(E(t),n)},defineProperty:Q,defineProperties:E1,getOwnPropertyDescriptor:H1,getOwnPropertyNames:I1,getOwnPropertySymbols:J1});var tt=f(function(){I.f(1)});o(o.S+o.F*tt,"Object",{getOwnPropertySymbols:function getOwnPropertySymbols(t){return I.f(S(t))}}),R&&o(o.S+o.F*(!q||f(function(){var t=j();return"[null]"!=T([t])||"{}"!=T({a:t})||"{}"!=T(Object(t))})),"JSON",{stringify:function stringify(t){for(var n,r,e=[t],i=1;i<arguments.length;)e.push(arguments[i++]);if(r=n=e[1],(m(n)||void 0!==t)&&!$(t))return d(n)||(n=function(t,n){if("function"==typeof r&&(n=r.call(this,t,n)),!$(n))return n}),e[1]=n,T.apply(R,e)}}),j[L][G]||t(72)(j[L],G,j[L].valueOf),l(j,"Symbol"),l(Math,"Math",!0),l(e.JSON,"JSON",!0)},{101:101,102:102,103:103,104:104,107:107,108:108,116:116,118:118,124:124,126:126,140:140,142:142,143:143,147:147,150:150,151:151,152:152,38:38,58:58,61:61,62:62,64:64,70:70,71:71,72:72,79:79,81:81,89:89,94:94,98:98,99:99}],279:[function(t,n,r){"use strict";var e=t(62),i=t(146),o=t(145),f=t(38),s=t(137),l=t(141),u=t(81),c=t(70).ArrayBuffer,h=t(127),p=o.ArrayBuffer,v=o.DataView,a=i.ABV&&c.isView,g=p.prototype.slice,y=i.VIEW,d="ArrayBuffer";e(e.G+e.W+e.F*(c!==p),{ArrayBuffer:p}),e(e.S+e.F*!i.CONSTR,d,{isView:function isView(t){return a&&a(t)||u(t)&&y in t}}),e(e.P+e.U+e.F*t(64)(function(){return!new p(2).slice(1,void 0).byteLength}),d,{slice:function slice(t,n){if(void 0!==g&&void 0===n)return g.call(f(this),t);for(var r=f(this).byteLength,e=s(t,r),i=s(void 0===n?r:n,r),o=new(h(this,p))(l(i-e)),u=new v(this),c=new v(o),a=0;e<i;)c.setUint8(a++,u.getUint8(e++));return o}}),t(123)(d)},{123:123,127:127,137:137,141:141,145:145,146:146,38:38,62:62,64:64,70:70,81:81}],280:[function(t,n,r){var e=t(62);e(e.G+e.W+e.F*!t(146).ABV,{DataView:t(145).DataView})},{145:145,146:146,62:62}],281:[function(t,n,r){t(144)("Float32",4,function(e){return function Float32Array(t,n,r){return e(this,t,n,r)}})},{144:144}],282:[function(t,n,r){t(144)("Float64",8,function(e){return function Float64Array(t,n,r){return e(this,t,n,r)}})},{144:144}],283:[function(t,n,r){t(144)("Int16",2,function(e){return function Int16Array(t,n,r){return e(this,t,n,r)}})},{144:144}],284:[function(t,n,r){t(144)("Int32",4,function(e){return function Int32Array(t,n,r){return e(this,t,n,r)}})},{144:144}],285:[function(t,n,r){t(144)("Int8",1,function(e){return function Int8Array(t,n,r){return e(this,t,n,r)}})},{144:144}],286:[function(t,n,r){t(144)("Uint16",2,function(e){return function Uint16Array(t,n,r){return e(this,t,n,r)}})},{144:144}],287:[function(t,n,r){t(144)("Uint32",4,function(e){return function Uint32Array(t,n,r){return e(this,t,n,r)}})},{144:144}],288:[function(t,n,r){t(144)("Uint8",1,function(e){return function Uint8Array(t,n,r){return e(this,t,n,r)}})},{144:144}],289:[function(t,n,r){t(144)("Uint8",1,function(e){return function Uint8ClampedArray(t,n,r){return e(this,t,n,r)}},!0)},{144:144}],290:[function(t,n,r){"use strict";function R4(t){return function WeakMap(){return t(this,0<arguments.length?arguments[0]:void 0)}}var o,e=t(70),i=t(42)(0),u=t(118),c=t(94),a=t(97),f=t(50),s=t(81),l=t(149),h=t(149),p=!e.ActiveXObject&&"ActiveXObject"in e,v="WeakMap",g=c.getWeak,y=Object.isExtensible,d=f.ufstore,x={get:function get(t){if(s(t)){var n=g(t);return!0===n?d(l(this,v)).get(t):n?n[this._i]:void 0}},set:function set(t,n){return f.def(l(this,v),t,n)}},m=n.exports=t(51)(v,R4,x,f,!0,!0);h&&p&&(a((o=f.getConstructor(R4,v)).prototype,x),c.NEED=!0,i(["delete","has","get","set"],function(e){var t=m.prototype,i=t[e];u(t,e,function(t,n){if(!s(t)||y(t))return i.call(this,t,n);this._f||(this._f=new o);var r=this._f[e](t,n);return"set"==e?this:r})}))},{118:118,149:149,42:42,50:50,51:51,70:70,81:81,94:94,97:97}],291:[function(t,n,r){"use strict";var e=t(50),i=t(149),o="WeakSet";t(51)(o,function(t){return function WeakSet(){return t(this,0<arguments.length?arguments[0]:void 0)}},{add:function add(t){return e.def(i(this,o),t,!0)}},e,!1,!0)},{149:149,50:50,51:51}],292:[function(t,n,r){"use strict";var e=t(62),i=t(67),o=t(142),u=t(141),c=t(33),a=t(45);e(e.P,"Array",{flatMap:function flatMap(t){var n,r,e=o(this);return c(t),n=u(e.length),r=a(e,0),i(r,e,e,n,0,1,t,arguments[1]),r}}),t(35)("flatMap")},{141:141,142:142,33:33,35:35,45:45,62:62,67:67}],293:[function(t,n,r){"use strict";var e=t(62),i=t(41)(!0);e(e.P,"Array",{includes:function includes(t){return i(this,t,1<arguments.length?arguments[1]:void 0)}}),t(35)("includes")},{35:35,41:41,62:62}],294:[function(t,n,r){var e=t(62),i=t(110)(!0);e(e.S,"Object",{entries:function entries(t){return i(t)}})},{110:110,62:62}],295:[function(t,n,r){var e=t(62),a=t(111),f=t(140),s=t(101),l=t(53);e(e.S,"Object",{getOwnPropertyDescriptors:function getOwnPropertyDescriptors(t){for(var n,r,e=f(t),i=s.f,o=a(e),u={},c=0;o.length>c;)void 0!==(r=i(e,n=o[c++]))&&l(u,n,r);return u}})},{101:101,111:111,140:140,53:53,62:62}],296:[function(t,n,r){var e=t(62),i=t(110)(!1);e(e.S,"Object",{values:function values(t){return i(t)}})},{110:110,62:62}],297:[function(t,n,r){"use strict";var e=t(62),i=t(52),o=t(70),u=t(127),c=t(115);e(e.P+e.R,"Promise",{finally:function(n){var r=u(this,i.Promise||o.Promise),t="function"==typeof n;return this.then(t?function(t){return c(r,n()).then(function(){return t})}:n,t?function(t){return c(r,n()).then(function(){throw t})}:n)}})},{115:115,127:127,52:52,62:62,70:70}],298:[function(t,n,r){"use strict";var e=t(62),i=t(132),o=t(148),u=/Version\/10\.\d+(\.\d+)?( Mobile\/\w+)? Safari\//.test(o);e(e.P+e.F*u,"String",{padEnd:function padEnd(t){return i(this,t,1<arguments.length?arguments[1]:void 0,!1)}})},{132:132,148:148,62:62}],299:[function(t,n,r){"use strict";var e=t(62),i=t(132),o=t(148),u=/Version\/10\.\d+(\.\d+)?( Mobile\/\w+)? Safari\//.test(o);e(e.P+e.F*u,"String",{padStart:function padStart(t){return i(this,t,1<arguments.length?arguments[1]:void 0,!0)}})},{132:132,148:148,62:62}],300:[function(t,n,r){"use strict";t(134)("trimLeft",function(t){return function trimLeft(){return t(this,1)}},"trimStart")},{134:134}],301:[function(t,n,r){"use strict";t(134)("trimRight",function(t){return function trimRight(){return t(this,2)}},"trimEnd")},{134:134}],302:[function(t,n,r){t(150)("asyncIterator")},{150:150}],303:[function(t,n,r){for(var e=t(164),i=t(107),o=t(118),u=t(70),c=t(72),a=t(88),f=t(152),s=f("iterator"),l=f("toStringTag"),h=a.Array,p={CSSRuleList:!0,CSSStyleDeclaration:!1,CSSValueList:!1,ClientRectList:!1,DOMRectList:!1,DOMStringList:!1,DOMTokenList:!0,DataTransferItemList:!1,FileList:!1,HTMLAllCollection:!1,HTMLCollection:!1,HTMLFormElement:!1,HTMLSelectElement:!1,MediaList:!0,MimeTypeArray:!1,NamedNodeMap:!1,NodeList:!0,PaintRequestList:!1,Plugin:!1,PluginArray:!1,SVGLengthList:!1,SVGNumberList:!1,SVGPathSegList:!1,SVGPointList:!1,SVGStringList:!1,SVGTransformList:!1,SourceBufferList:!1,StyleSheetList:!0,TextTrackCueList:!1,TextTrackList:!1,TouchList:!1},v=i(p),g=0;g<v.length;g++){var y,d=v[g],x=p[d],m=u[d],S=m&&m.prototype;if(S&&(S[s]||c(S,s,h),S[l]||c(S,l,d),a[d]=h,x))for(y in e)S[y]||o(S,y,e[y],!0)}},{107:107,118:118,152:152,164:164,70:70,72:72,88:88}],304:[function(t,n,r){var e=t(62),i=t(136);e(e.G+e.B,{setImmediate:i.set,clearImmediate:i.clear})},{136:136,62:62}],305:[function(t,n,r){function y7(i){return function(t,n){var r=2<arguments.length,e=r&&u.call(arguments,2);return i(r?function(){("function"==typeof t?t:Function(t)).apply(this,e)}:t,n)}}var e=t(70),i=t(62),o=t(148),u=[].slice,c=/MSIE .\./.test(o);i(i.G+i.B+i.F*c,{setTimeout:y7(e.setTimeout),setInterval:y7(e.setInterval)})},{148:148,62:62,70:70}],306:[function(t,n,r){t(305),t(304),t(303),n.exports=t(52)},{303:303,304:304,305:305,52:52}],307:[function(t,n,r){var e=function(u){"use strict";var c,t=Object.prototype,f=t.hasOwnProperty,n="function"==typeof Symbol?Symbol:{},i=n.iterator||"@@iterator",r=n.asyncIterator||"@@asyncIterator",e=n.toStringTag||"@@toStringTag";function wrap(t,n,r,e){var i=n&&n.prototype instanceof Generator?n:Generator,o=Object.create(i.prototype),u=new Context(e||[]);return o._invoke=function makeInvokeMethod(o,u,c){var a=s;return function invoke(t,n){if(a===h)throw new Error("Generator is already running");if(a===p){if("throw"===t)throw n;return doneResult()}for(c.method=t,c.arg=n;;){var r=c.delegate;if(r){var e=maybeInvokeDelegate(r,c);if(e){if(e===v)continue;return e}}if("next"===c.method)c.sent=c._sent=c.arg;else if("throw"===c.method){if(a===s)throw a=p,c.arg;c.dispatchException(c.arg)}else"return"===c.method&&c.abrupt("return",c.arg);a=h;var i=tryCatch(o,u,c);if("normal"===i.type){if(a=c.done?p:l,i.arg===v)continue;return{value:i.arg,done:c.done}}"throw"===i.type&&(a=p,c.method="throw",c.arg=i.arg)}}}(t,r,u),o}function tryCatch(t,n,r){try{return{type:"normal",arg:t.call(n,r)}}catch(t){return{type:"throw",arg:t}}}u.wrap=wrap;var s="suspendedStart",l="suspendedYield",h="executing",p="completed",v={};function Generator(){}function GeneratorFunction(){}function GeneratorFunctionPrototype(){}var o={};o[i]=function(){return this};var a=Object.getPrototypeOf,g=a&&a(a(values([])));g&&g!==t&&f.call(g,i)&&(o=g);var y=GeneratorFunctionPrototype.prototype=Generator.prototype=Object.create(o);function defineIteratorMethods(t){["next","throw","return"].forEach(function(n){t[n]=function(t){return this._invoke(n,t)}})}function AsyncIterator(c,a){var t;this._invoke=function enqueue(r,e){function callInvokeWithMethodAndArg(){return new a(function(t,n){!function invoke(t,n,r,e){var i=tryCatch(c[t],c,n);if("throw"!==i.type){var o=i.arg,u=o.value;return u&&"object"==typeof u&&f.call(u,"__await")?a.resolve(u.__await).then(function(t){invoke("next",t,r,e)},function(t){invoke("throw",t,r,e)}):a.resolve(u).then(function(t){o.value=t,r(o)},function(t){return invoke("throw",t,r,e)})}e(i.arg)}(r,e,t,n)})}return t=t?t.then(callInvokeWithMethodAndArg,callInvokeWithMethodAndArg):callInvokeWithMethodAndArg()}}function maybeInvokeDelegate(t,n){var r=t.iterator[n.method];if(r===c){if(n.delegate=null,"throw"===n.method){if(t.iterator.return&&(n.method="return",n.arg=c,maybeInvokeDelegate(t,n),"throw"===n.method))return v;n.method="throw",n.arg=new TypeError("The iterator does not provide a 'throw' method")}return v}var e=tryCatch(r,t.iterator,n.arg);if("throw"===e.type)return n.method="throw",n.arg=e.arg,n.delegate=null,v;var i=e.arg;return i?i.done?(n[t.resultName]=i.value,n.next=t.nextLoc,"return"!==n.method&&(n.method="next",n.arg=c),n.delegate=null,v):i:(n.method="throw",n.arg=new TypeError("iterator result is not an object"),n.delegate=null,v)}function pushTryEntry(t){var n={tryLoc:t[0]};1 in t&&(n.catchLoc=t[1]),2 in t&&(n.finallyLoc=t[2],n.afterLoc=t[3]),this.tryEntries.push(n)}function resetTryEntry(t){var n=t.completion||{};n.type="normal",delete n.arg,t.completion=n}function Context(t){this.tryEntries=[{tryLoc:"root"}],t.forEach(pushTryEntry,this),this.reset(!0)}function values(t){if(t){var n=t[i];if(n)return n.call(t);if("function"==typeof t.next)return t;if(!isNaN(t.length)){var r=-1,e=function next(){for(;++r<t.length;)if(f.call(t,r))return next.value=t[r],next.done=!1,next;return next.value=c,next.done=!0,next};return e.next=e}}return{next:doneResult}}function doneResult(){return{value:c,done:!0}}return GeneratorFunction.prototype=y.constructor=GeneratorFunctionPrototype,GeneratorFunctionPrototype.constructor=GeneratorFunction,GeneratorFunctionPrototype[e]=GeneratorFunction.displayName="GeneratorFunction",u.isGeneratorFunction=function(t){var n="function"==typeof t&&t.constructor;return!!n&&(n===GeneratorFunction||"GeneratorFunction"===(n.displayName||n.name))},u.mark=function(t){return Object.setPrototypeOf?Object.setPrototypeOf(t,GeneratorFunctionPrototype):(t.__proto__=GeneratorFunctionPrototype,e in t||(t[e]="GeneratorFunction")),t.prototype=Object.create(y),t},u.awrap=function(t){return{__await:t}},defineIteratorMethods(AsyncIterator.prototype),AsyncIterator.prototype[r]=function(){return this},u.AsyncIterator=AsyncIterator,u.async=function(t,n,r,e,i){void 0===i&&(i=Promise);var o=new AsyncIterator(wrap(t,n,r,e),i);return u.isGeneratorFunction(n)?o:o.next().then(function(t){return t.done?t.value:o.next()})},defineIteratorMethods(y),y[e]="Generator",y[i]=function(){return this},y.toString=function(){return"[object Generator]"},u.keys=function(n){var r=[];for(var t in n)r.push(t);return r.reverse(),function next(){for(;r.length;){var t=r.pop();if(t in n)return next.value=t,next.done=!1,next}return next.done=!0,next}},u.values=values,Context.prototype={constructor:Context,reset:function(t){if(this.prev=0,this.next=0,this.sent=this._sent=c,this.done=!1,this.delegate=null,this.method="next",this.arg=c,this.tryEntries.forEach(resetTryEntry),!t)for(var n in this)"t"===n.charAt(0)&&f.call(this,n)&&!isNaN(+n.slice(1))&&(this[n]=c)},stop:function(){this.done=!0;var t=this.tryEntries[0].completion;if("throw"===t.type)throw t.arg;return this.rval},dispatchException:function(r){if(this.done)throw r;var e=this;function handle(t,n){return i.type="throw",i.arg=r,e.next=t,n&&(e.method="next",e.arg=c),!!n}for(var t=this.tryEntries.length-1;0<=t;--t){var n=this.tryEntries[t],i=n.completion;if("root"===n.tryLoc)return handle("end");if(n.tryLoc<=this.prev){var o=f.call(n,"catchLoc"),u=f.call(n,"finallyLoc");if(o&&u){if(this.prev<n.catchLoc)return handle(n.catchLoc,!0);if(this.prev<n.finallyLoc)return handle(n.finallyLoc)}else if(o){if(this.prev<n.catchLoc)return handle(n.catchLoc,!0)}else{if(!u)throw new Error("try statement without catch or finally");if(this.prev<n.finallyLoc)return handle(n.finallyLoc)}}}},abrupt:function(t,n){for(var r=this.tryEntries.length-1;0<=r;--r){var e=this.tryEntries[r];if(e.tryLoc<=this.prev&&f.call(e,"finallyLoc")&&this.prev<e.finallyLoc){var i=e;break}}i&&("break"===t||"continue"===t)&&i.tryLoc<=n&&n<=i.finallyLoc&&(i=null);var o=i?i.completion:{};return o.type=t,o.arg=n,i?(this.method="next",this.next=i.finallyLoc,v):this.complete(o)},complete:function(t,n){if("throw"===t.type)throw t.arg;return"break"===t.type||"continue"===t.type?this.next=t.arg:"return"===t.type?(this.rval=this.arg=t.arg,this.method="return",this.next="end"):"normal"===t.type&&n&&(this.next=n),v},finish:function(t){for(var n=this.tryEntries.length-1;0<=n;--n){var r=this.tryEntries[n];if(r.finallyLoc===t)return this.complete(r.completion,r.afterLoc),resetTryEntry(r),v}},catch:function(t){for(var n=this.tryEntries.length-1;0<=n;--n){var r=this.tryEntries[n];if(r.tryLoc===t){var e=r.completion;if("throw"===e.type){var i=e.arg;resetTryEntry(r)}return i}}throw new Error("illegal catch attempt")},delegateYield:function(t,n,r){return this.delegate={iterator:values(t),resultName:n,nextLoc:r},"next"===this.method&&(this.arg=c),v}},u}("object"==typeof n?n.exports:{});try{regeneratorRuntime=e}catch(t){Function("r","regeneratorRuntime = r")(e)}},{}]},{},[1]);

(function() {
  if (typeof window.CustomEvent === 'function') return false;

  function CustomEvent(event, params) {
    params = params || { bubbles: false, cancelable: false, detail: null };
    var evt = document.createEvent('CustomEvent');
    evt.initCustomEvent(event, params.bubbles, params.cancelable, params.detail);
    return evt;
  }

  window.CustomEvent = CustomEvent;
})();

/**
 * Common google analytics code
 *
 * @type {{}}
 */
var mq = mq || {};
mq.common = mq.common || {};

mq.common.Analytics = function() {
};

mq.common.Analytics.prototype = function() {
    /**
     * Function to send custom events to GA. e.g
     * {
     *     'category': 'social',
     *     'action': 'share',
     *     'label': 'facebook'
     * }
     * @param category
     * @param action
     * @param label
     * @private
     */
    var _push = function(category, action, label) {
        if(typeof dataLayer !== 'undefined') {
            dataLayer.push({
                'event': 'customEvent',
                'category': category,
                'action': action,
                'label': label
            });
        }
    };


    return {
        push: _push
    }
}();
