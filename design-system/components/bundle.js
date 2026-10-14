/* @ds-bundle: {"format":4,"namespace":"Udekom","components":[{"name":"Button"},{"name":"CircleButton"},{"name":"ArrowButton"},{"name":"NavLink"},{"name":"SegmentedTabs"},{"name":"TextField"},{"name":"Select"},{"name":"Textarea"},{"name":"Checkbox"},{"name":"Radio"},{"name":"Tag"},{"name":"FileButton"},{"name":"FormCard"},{"name":"Icon"},{"name":"TextButton"},{"name":"IconButton"},{"name":"NumberField"},{"name":"DateField"},{"name":"PasswordField"},{"name":"SearchField"},{"name":"Switch"},{"name":"RadioGroup"},{"name":"CheckboxGroup"},{"name":"ScaleField"},{"name":"Autocomplete"},{"name":"FileDropzone"},{"name":"DataTable"},{"name":"Pagination"},{"name":"StatusBadge"},{"name":"Avatar"},{"name":"Card"},{"name":"DescriptionList"},{"name":"EmptyState"},{"name":"Skeleton"},{"name":"Spinner"},{"name":"Tooltip"},{"name":"ProgressBar"},{"name":"Alert"},{"name":"ToastHost"},{"name":"Dialog"},{"name":"ConfirmDialog"},{"name":"Drawer"},{"name":"Tabs"},{"name":"Breadcrumbs"},{"name":"Stepper"},{"name":"Menu"},{"name":"SidebarNav"},{"name":"AppShell"},{"name":"PageHeader"},{"name":"Repeater"},{"name":"PermissionMatrix"},{"name":"FilterBar"},{"name":"LabelsProvider"}]} */
/* @ds-version: 2.3.0 */
(function () {
  var React = window.React;
  var h = React.createElement;

  function cx() {
    var out = [];
    for (var i = 0; i < arguments.length; i++) { if (arguments[i]) out.push(arguments[i]); }
    return out.join(" ");
  }
  function omit(obj, keys) {
    var out = {};
    for (var k in obj) { if (Object.prototype.hasOwnProperty.call(obj, k) && keys.indexOf(k) < 0) out[k] = obj[k]; }
    return out;
  }

  /* ---------- Labels (version 2): no fixed English text in a component ----------
     These are the English defaults of every text a component writes by itself. Translate them
     for a whole subtree with <LabelsProvider labels={{...}}>, or for one component with its
     `labels` prop; a component's own text prop (label, buttonText, confirmText, ...) still wins.
     Texts are plain strings; a part in braces, such as {name}, is filled in by the component. */
  var DEFAULT_LABELS = {
    previous: "Previous", next: "Next",
    remove: "Remove", removeItem: "Remove {name}",
    chooseFile: "Please Select File",
    showPasswordText: "Show password", hidePasswordText: "Hide password",
    search: "Search", clearSearch: "Clear search",
    noMatches: "No matches",
    dropFiles: "Drop files here or click to choose",
    uploading: "Uploading {name}",
    loading: "Loading",
    selectAllRows: "Select all rows", selectRow: "Select row",
    nothingHere: "Nothing here yet", noResults: "No results for these filters",
    pagination: "Pagination", pageRange: "{from}\u2013{to} of {total}", rowsPerPage: "Rows per page",
    previousPage: "Previous page", nextPage: "Next page",
    dismiss: "Dismiss", close: "Close",
    cancel: "Cancel", confirm: "Confirm", working: "Working",
    breadcrumb: "Breadcrumb", moreActions: "More actions", mainNavigation: "Main", openNavigation: "Open navigation",
    removeRow: "Remove {index}", addRow: "Add row",
    permission: "Permission", rolePermission: "{role}: {permission}",
    clearFilters: "Clear filters"
  };
  /* Renamed in 2.1.0 (the name of a label does not end with the word for a secret). A list of
     labels that still gives a text under the name of 2.0 is understood. */
  var RENAMED_LABELS = { showPasswordText: "showPassword", hidePasswordText: "hidePassword" };
  /* The text a list of labels gives for a key, under its name or under the name it had before. */
  function labelFrom(labels, key) {
    if (!labels) return null;
    if (labels[key] != null) return labels[key];
    var before = RENAMED_LABELS[key];
    return before && labels[before] != null ? labels[before] : null;
  }
  var LabelsContext = React.createContext(null);
  /* Returns t(key, values): the component's own `labels`, then the provider's, then the default. */
  function useLabels(props) {
    var fromProvider = React.useContext(LabelsContext);
    var own = props && props.labels;
    return function (key, values) {
      var text = labelFrom(own, key);
      if (text == null) text = labelFrom(fromProvider, key);
      if (text == null) text = DEFAULT_LABELS[key];
      text = String(text);
      if (values) { for (var k in values) { if (Object.prototype.hasOwnProperty.call(values, k)) text = text.split("{" + k + "}").join(String(values[k])); } }
      return text;
    };
  }
  /* Translates the built-in texts of every component inside it. Providers can be nested. */
  function LabelsProvider(props) {
    var outer = React.useContext(LabelsContext);
    return h(LabelsContext.Provider, { value: Object.assign({}, outer || {}, props.labels || {}) }, props.children);
  }

  /* Icons: the Figma file uses Lucide icon names (mail, alert-circle, check-circle-2, x, check). Paths are Lucide's (ISC licence). */
  var ICONS = {
    "mail": [["rect", { x: 2, y: 4, width: 20, height: 16, rx: 2 }], ["path", { d: "m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" }]],
    "alert-circle": [["circle", { cx: 12, cy: 12, r: 10 }], ["line", { x1: 12, x2: 12, y1: 8, y2: 12 }], ["line", { x1: 12, x2: 12.01, y1: 16, y2: 16 }]],
    "check-circle-2": [["circle", { cx: 12, cy: 12, r: 10 }], ["path", { d: "m9 12 2 2 4-4" }]],
    "check": [["path", { d: "M20 6 9 17l-5-5" }]],
    "x": [["path", { d: "M18 6 6 18" }], ["path", { d: "m6 6 12 12" }]],
    "chevron-down": [["path", { d: "m6 9 6 6 6-6" }]],
    "arrow-left": [["path", { d: "m12 19-7-7 7-7" }], ["path", { d: "M19 12H5" }]],
    "arrow-right": [["path", { d: "M5 12h14" }], ["path", { d: "m12 5 7 7-7 7" }]],
    "arrow-up-right": [["path", { d: "M7 7h10v10" }], ["path", { d: "M7 17 17 7" }]],
    "upload": [["path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }], ["path", { d: "m17 8-5-5-5 5" }], ["path", { d: "M12 3v12" }]],
    "info": [["circle", { cx: 12, cy: 12, r: 10 }], ["path", { d: "M12 16v-4" }], ["path", { d: "M12 8h.01" }]]
  };

  function Icon(props) {
    var name = props.name, size = props.size || 16, strokeWidth = props.strokeWidth || 2;
    var parts = ICONS[name] || [];
    var children = parts.map(function (p, i) { return h(p[0], Object.assign({ key: i }, p[1])); });
    return h("svg", {
      className: cx("ud-icon", props.className), width: size, height: size, viewBox: "0 0 24 24",
      fill: "none", stroke: "currentColor", strokeWidth: strokeWidth, strokeLinecap: "round", strokeLinejoin: "round",
      "aria-hidden": props.title ? undefined : true, role: props.title ? "img" : undefined
    }, props.title ? h("title", null, props.title) : null, children);
  }

  /* Pill button. variant: "primary" (orange) | "dark". */
  function Button(props) {
    var variant = props.variant || "primary";
    var rest = omit(props, ["variant", "className", "children", "icon", "iconPosition"]);
    var icon = props.icon ? h(Icon, { name: props.icon, size: 16 }) : null;
    return h("button", Object.assign({ type: "button" }, rest, {
      className: cx("ud-btn", "ud-btn--" + variant, props.className)
    }), props.iconPosition !== "end" ? icon : null, h("span", null, props.children), props.iconPosition === "end" ? icon : null);
  }

  /* The large round "Become a member" call to action. */
  function CircleButton(props) {
    var rest = omit(props, ["className", "children", "size", "tilt"]);
    var style = {};
    if (props.size) { style.width = props.size; style.height = props.size; }
    return h("button", Object.assign({ type: "button" }, rest, {
      className: cx("ud-circle-btn", props.tilt === false ? "ud-circle-btn--flat" : null, props.className), style: style
    }), h("span", { className: "ud-circle-btn__label" }, props.children));
  }

  /* Round arrow button for sliders and cards. variant: "outline" | "outline-orange" | "orange" | "white". */
  function ArrowButton(props) {
    var variant = props.variant || "outline";
    var dir = props.direction || "right";
    var t = useLabels(props);
    var rest = omit(props, ["className", "variant", "direction", "size", "label", "labels"]);
    return h("button", Object.assign({ type: "button", "aria-label": props.label || t(dir === "left" ? "previous" : "next") }, rest, {
      className: cx("ud-arrow-btn", "ud-arrow-btn--" + variant, props.size === "sm" ? "ud-arrow-btn--sm" : null, props.className)
    }), h(Icon, { name: "arrow-" + dir, size: props.size === "sm" ? 14 : 16 }));
  }

  /* Header and footer navigation link. active: orange text; current: underlined. */
  function NavLink(props) {
    var rest = omit(props, ["className", "active", "current", "children"]);
    return h("a", Object.assign({}, rest, {
      className: cx("ud-nav-link", props.active ? "is-active" : null, props.current ? "is-current" : null, props.className),
      "aria-current": props.current ? "page" : undefined
    }), props.children);
  }

  /* Two or more pill tabs, e.g. Individuals / Companies on the application form.
     Options with `content` make a tab list with a panel. Without content there is nothing a tab
     could control, so the same pills are a radio group: one value out of several (for example
     the language of a form). Arrow keys, Home and End move the choice in both. */
  function SegmentedTabs(props) {
    var options = (props.options || []).map(function (o) { return typeof o === "string" ? { value: o, label: o } : o; });
    var base = useId();
    var hasPanels = options.some(function (o) { return o.content !== undefined; });
    var index = -1;
    for (var i = 0; i < options.length; i++) { if (options[i].value === props.value) index = i; }
    function choose(i) { if (props.onChange) props.onChange(options[i].value); }
    function onKey(e, i) {
      var n = e.key === "ArrowRight" || e.key === "ArrowDown" ? i + 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? options.length - 1 : null;
      if (n === null) return;
      e.preventDefault(); n = (n + options.length) % options.length; choose(n);
      var el = document.getElementById(base + "-tab-" + n); el && el.focus();
    }
    var list = h("div", { className: cx("ud-tabs", props.className), role: hasPanels ? "tablist" : "radiogroup", "aria-label": props.label },
      options.map(function (o, i) {
        var selected = i === index;
        return h("button", {
          key: o.value, id: base + "-tab-" + i, type: "button",
          role: hasPanels ? "tab" : "radio",
          "aria-selected": hasPanels ? selected : undefined, "aria-checked": hasPanels ? undefined : selected,
          "aria-controls": hasPanels && selected ? base + "-panel" : undefined,
          tabIndex: selected || (index < 0 && i === 0) ? 0 : -1,
          className: cx("ud-tab", selected ? "is-selected" : null),
          onClick: function () { choose(i); }, onKeyDown: function (e) { onKey(e, i); }
        }, o.label);
      }));
    if (!hasPanels) return list;
    return h("div", { className: "ud-tabs-wrap" }, list,
      index >= 0 ? h("div", { id: base + "-panel", role: "tabpanel", "aria-labelledby": base + "-tab-" + index, className: "ud-tabs__panel", tabIndex: 0 }, options[index].content) : null);
  }

  function statusIcon(status) {
    if (status === "error") return h(Icon, { name: "alert-circle", size: 16, className: "ud-field__status" });
    if (status === "success") return h(Icon, { name: "check-circle-2", size: 16, className: "ud-field__status" });
    return null;
  }

  /* The frame of every field. The control always has an id (the one passed in, or a generated
     one), so the label and the message are tied to it without the caller doing anything. */
  function fieldShell(props, control, extraEnd) {
    var status = props.status || "default";
    var autoId = useId();
    var id = props.id || autoId;
    var msgId = props.message ? id + "-msg" : undefined;
    var describedBy = cx(props["aria-describedby"], msgId) || undefined;
    return h("div", { className: cx("ud-field", "ud-field--" + status, props.disabled ? "is-disabled" : null, props.className) },
      props.label ? h("label", { className: "ud-field__label", htmlFor: id }, props.label, props.required ? h("span", { "aria-hidden": true }, " *") : null) : null,
      h("div", { className: "ud-field__box" },
        props.icon ? h(Icon, { name: props.icon, size: 16, className: "ud-field__icon" }) : null,
        control(describedBy, id),
        statusIcon(status),
        extraEnd || null),
      props.message ? h("p", { className: "ud-field__message", id: msgId }, props.message) : null);
  }

  /* Text input with label, optional icon, status and message line. status: "default" | "error" | "success". */
  function TextField(props) {
    var inputProps = omit(props, ["className", "label", "message", "status", "icon", "required"]);
    return fieldShell(props, function (msgId, id) {
      return h("input", Object.assign({ type: "text" }, inputProps, {
        id: id, className: "ud-field__control", required: props.required,
        "aria-invalid": props.status === "error" ? true : undefined, "aria-describedby": msgId
      }));
    });
  }

  /* Native select styled like TextField. options: [{value,label}] or strings. */
  function Select(props) {
    var selectProps = omit(props, ["className", "label", "message", "status", "icon", "options", "placeholder", "required"]);
    var opts = (props.options || []).map(function (o) {
      var value = typeof o === "string" ? o : o.value;
      return h("option", { key: value, value: value }, typeof o === "string" ? o : o.label);
    });
    if (props.placeholder) opts.unshift(h("option", { key: "__ph", value: "", disabled: true }, props.placeholder));
    return fieldShell(props, function (msgId, id) {
      return h("select", Object.assign({}, selectProps, {
        id: id, className: "ud-field__control", required: props.required,
        "aria-invalid": props.status === "error" ? true : undefined, "aria-describedby": msgId
      }), opts);
    }, h(Icon, { name: "chevron-down", size: 16, className: "ud-field__chevron" }));
  }

  /* Multi-line field, e.g. biography (up to 300 words). */
  function Textarea(props) {
    var areaProps = omit(props, ["className", "label", "message", "status", "icon", "required"]);
    return fieldShell(Object.assign({}, props, { className: cx("ud-field--area", props.className) }), function (msgId, id) {
      return h("textarea", Object.assign({ rows: 4 }, areaProps, {
        id: id, className: "ud-field__control", required: props.required,
        "aria-invalid": props.status === "error" ? true : undefined, "aria-describedby": msgId
      }));
    });
  }

  /* A checkbox can be required (the same "*" as a field), and show a status and a message tied to it by
     aria-describedby (2.2.0). The message follows the label as its sibling, so the input is never
     re-created when a message comes or goes. */
  function Checkbox(props) {
    var inputProps = omit(props, ["className", "label", "children", "status", "message", "required"]);
    var autoId = useId();
    var msgId = props.message ? (props.id || autoId) + "-msg" : undefined;
    var error = props.status === "error";
    return h(React.Fragment, null,
      h("label", { className: cx("ud-check", error ? "ud-check--error" : null, props.disabled ? "is-disabled" : null, props.className) },
        h("input", Object.assign({ type: "checkbox" }, inputProps, { className: "ud-check__input", required: props.required,
          "aria-invalid": error ? true : props["aria-invalid"], "aria-describedby": cx(props["aria-describedby"], msgId) || undefined })),
        h("span", { className: "ud-check__box", "aria-hidden": true }, h(Icon, { name: "check", size: 12, strokeWidth: 3 })),
        h("span", { className: "ud-check__label" }, props.label || props.children, props.required ? h("span", { "aria-hidden": true }, " *") : null)),
      props.message ? h("p", { className: cx("ud-field__message", error ? "is-error" : null), id: msgId }, props.message) : null);
  }

  function Radio(props) {
    var inputProps = omit(props, ["className", "label", "children"]);
    return h("label", { className: cx("ud-radio", props.disabled ? "is-disabled" : null, props.className) },
      h("input", Object.assign({ type: "radio" }, inputProps, { className: "ud-radio__input" })),
      h("span", { className: "ud-radio__dot", "aria-hidden": true }),
      h("span", { className: "ud-radio__label" }, props.label || props.children));
  }

  /* Small chip, e.g. a chosen term in a multiselect. */
  function Tag(props) {
    var t = useLabels(props);
    return h("span", { className: cx("ud-tag", props.className) }, props.children,
      props.onRemove ? h("button", { type: "button", className: "ud-tag__remove", onClick: props.onRemove, "aria-label": typeof props.children === "string" ? t("removeItem", { name: props.children }) : t("remove") }, h(Icon, { name: "x", size: 10, strokeWidth: 2.5 })) : null);
  }

  /* File picker: label and hint on the left, dark pill on the right. */
  function FileButton(props) {
    var t = useLabels(props);
    var base = useId();
    var inputProps = omit(props, ["className", "label", "hint", "fileName", "buttonText", "required", "labels"]);
    var describedBy = cx(props["aria-describedby"], props.fileName ? base + "-name" : null, props.hint ? base + "-hint" : null) || undefined;
    return h("div", { className: cx("ud-file", props.className) },
      h("div", { className: "ud-file__text" },
        props.label ? h("span", { className: "ud-file__label", id: base + "-label" }, props.label, props.required ? h("span", { "aria-hidden": true }, " *") : null) : null,
        props.fileName ? h("span", { className: "ud-file__name", id: base + "-name" }, props.fileName) : null,
        props.hint ? h("span", { className: "ud-file__hint", id: base + "-hint" }, props.hint) : null),
      h("label", { className: "ud-file__btn" },
        h("input", Object.assign({ type: "file", required: props.required }, inputProps, { className: "ud-file__input", "aria-labelledby": props.label ? base + "-label " + base + "-btn" : undefined, "aria-describedby": describedBy })),
        h("span", { id: base + "-btn" }, props.buttonText || t("chooseFile")),
        h(Icon, { name: "upload", size: 14 })));
  }

  /* White card that holds a form, with its intro line and actions. */
  function FormCard(props) {
    return h("section", { className: cx("ud-form-card", props.className) },
      props.title ? h("h2", { className: "ud-form-card__title" }, props.title) : null,
      h("div", { className: "ud-form-card__body" }, props.children),
      props.actions ? h("div", { className: "ud-form-card__actions" }, props.actions) : null);
  }


  /* ================= Extended set (2026-10-12): controls for Confera admin and long forms ================= */
  var useState = React.useState, useEffect = React.useEffect, useRef = React.useRef, useId = React.useId || function () { var r = useRef("ud-" + Math.random().toString(36).slice(2, 8)); return r.current; };
  var ICONS2 = {
    "search": [["circle", { cx: 11, cy: 11, r: 8 }], ["path", { d: "m21 21-4.3-4.3" }]],
    "eye": [["path", { d: "M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0" }], ["circle", { cx: 12, cy: 12, r: 3 }]],
    "eye-off": [["path", { d: "M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" }], ["path", { d: "M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" }], ["path", { d: "M14.12 14.12a3 3 0 1 1-4.24-4.24" }], ["path", { d: "m2 2 20 20" }]],
    "calendar": [["rect", { x: 3, y: 4, width: 18, height: 18, rx: 2 }], ["path", { d: "M16 2v4" }], ["path", { d: "M8 2v4" }], ["path", { d: "M3 10h18" }]],
    "chevron-up": [["path", { d: "m18 15-6-6-6 6" }]],
    "chevron-left": [["path", { d: "m15 18-6-6 6-6" }]],
    "chevron-right": [["path", { d: "m9 18 6-6-6-6" }]],
    "chevrons-up-down": [["path", { d: "m7 15 5 5 5-5" }], ["path", { d: "m7 9 5-5 5 5" }]],
    "plus": [["path", { d: "M5 12h14" }], ["path", { d: "M12 5v14" }]],
    "trash": [["path", { d: "M3 6h18" }], ["path", { d: "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" }], ["path", { d: "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" }]],
    "more": [["circle", { cx: 12, cy: 12, r: 1 }], ["circle", { cx: 19, cy: 12, r: 1 }], ["circle", { cx: 5, cy: 12, r: 1 }]],
    "file": [["path", { d: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" }], ["path", { d: "M14 2v4a2 2 0 0 0 2 2h4" }]],
    "alert-triangle": [["path", { d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" }], ["path", { d: "M12 9v4" }], ["path", { d: "M12 17h.01" }]],
    "menu": [["path", { d: "M4 6h16" }], ["path", { d: "M4 12h16" }], ["path", { d: "M4 18h16" }]],
    "users": [["path", { d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" }], ["circle", { cx: 9, cy: 7, r: 4 }], ["path", { d: "M22 21v-2a4 4 0 0 0-3-3.87" }], ["path", { d: "M16 3.13a4 4 0 0 1 0 7.75" }]],
    "home": [["path", { d: "m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" }], ["path", { d: "M9 22V12h6v10" }]],
    "settings": [["circle", { cx: 12, cy: 12, r: 3 }], ["path", { d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" }]],
    "inbox": [["path", { d: "M22 12h-6l-2 3h-4l-2-3H2" }], ["path", { d: "M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" }]],
    "send": [["path", { d: "m22 2-7 20-4-9-9-4Z" }], ["path", { d: "M22 2 11 13" }]],
    "refresh": [["path", { d: "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" }], ["path", { d: "M21 3v5h-5" }], ["path", { d: "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" }], ["path", { d: "M8 16H3v5" }]],
    "filter": [["path", { d: "M22 3H2l8 9.46V19l4 2v-8.54L22 3z" }]],
    "minus": [["path", { d: "M5 12h14" }]],
    /* Added in version 2 (Lucide 1.56.0, ISC licence): what the Confera admin and its documents need. */
    "download": [["path", { d: "M12 15V3" }], ["path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }], ["path", { d: "m7 10 5 5 5-5" }]],
    "copy": [["rect", { width: 14, height: 14, x: 8, y: 8, rx: 2, ry: 2 }], ["path", { d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" }]],
    "external-link": [["path", { d: "M15 3h6v6" }], ["path", { d: "M10 14 21 3" }], ["path", { d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" }]],
    "edit": [["path", { d: "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" }], ["path", { d: "m15 5 4 4" }]],
    "globe": [["circle", { cx: 12, cy: 12, r: 10 }], ["path", { d: "M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" }], ["path", { d: "M2 12h20" }]],
    "log-out": [["path", { d: "m16 17 5-5-5-5" }], ["path", { d: "M21 12H9" }], ["path", { d: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" }]],
    "user": [["path", { d: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" }], ["circle", { cx: 12, cy: 7, r: 4 }]],
    "lock": [["rect", { width: 18, height: 11, x: 3, y: 11, rx: 2, ry: 2 }], ["path", { d: "M7 11V7a5 5 0 0 1 10 0v4" }]],
    "clock": [["circle", { cx: 12, cy: 12, r: 10 }], ["path", { d: "M12 6v6l4 2" }]],
    "file-text": [["path", { d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" }], ["path", { d: "M14 2v5a1 1 0 0 0 1 1h5" }], ["path", { d: "M10 9H8" }], ["path", { d: "M16 13H8" }], ["path", { d: "M16 17H8" }]],
    "credit-card": [["rect", { width: 20, height: 14, x: 2, y: 5, rx: 2 }], ["line", { x1: 2, x2: 22, y1: 10, y2: 10 }], ["path", { d: "M6 14h2" }]],
    "link": [["path", { d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" }], ["path", { d: "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" }]]
  };
  for (var k2 in ICONS2) { ICONS[k2] = ICONS2[k2]; }

  function useControllable(value, defaultValue, onChange) {
    var st = useState(defaultValue);
    var controlled = value !== undefined;
    return [controlled ? value : st[0], function (v) { if (!controlled) st[1](v); if (onChange) onChange(v); }];
  }

  /* ---------- Inputs ---------- */
  function NumberField(props) {
    var rest = omit(props, ["className", "label", "message", "status", "icon", "required", "unit"]);
    return fieldShell(props, function (msgId, id) {
      return h("input", Object.assign({ type: "number", inputMode: "decimal" }, rest, {
        id: id, className: "ud-field__control ud-num", required: props.required,
        "aria-invalid": props.status === "error" ? true : undefined, "aria-describedby": msgId
      }));
    }, props.unit ? h("span", { className: "ud-field__unit" }, props.unit) : null);
  }

  function DateField(props) {
    var rest = omit(props, ["className", "label", "message", "status", "icon", "required"]);
    return fieldShell(Object.assign({}, props, { icon: props.icon || "calendar" }), function (msgId, id) {
      return h("input", Object.assign({ type: "date" }, rest, {
        id: id, className: "ud-field__control", required: props.required,
        "aria-invalid": props.status === "error" ? true : undefined, "aria-describedby": msgId
      }));
    });
  }

  function PasswordField(props) {
    var shown = useState(false);
    var t = useLabels(props);
    var rest = omit(props, ["className", "label", "message", "status", "icon", "required", "labels"]);
    return fieldShell(props, function (msgId, id) {
      return h("input", Object.assign({ autoComplete: "current-password" }, rest, {
        type: shown[0] ? "text" : "password",
        id: id, className: "ud-field__control", required: props.required,
        "aria-invalid": props.status === "error" ? true : undefined, "aria-describedby": msgId
      }));
    }, h("button", { type: "button", className: "ud-field__action", onClick: function () { shown[1](!shown[0]); }, "aria-label": t(shown[0] ? "hidePasswordText" : "showPasswordText"), "aria-pressed": shown[0] },
      h(Icon, { name: shown[0] ? "eye-off" : "eye", size: 16 })));
  }

  function SearchField(props) {
    var t = useLabels(props);
    var rest = omit(props, ["className", "label", "onClear", "labels"]);
    return h("div", { className: cx("ud-search", props.className), role: "search" },
      h(Icon, { name: "search", size: 16, className: "ud-search__icon" }),
      h("input", Object.assign({ type: "search", "aria-label": props.label || props.placeholder || t("search") }, rest, { className: "ud-search__control" })),
      props.value && props.onClear ? h("button", { type: "button", className: "ud-search__clear", onClick: props.onClear, "aria-label": t("clearSearch") }, h(Icon, { name: "x", size: 14 })) : null);
  }

  function Switch(props) {
    var rest = omit(props, ["className", "label", "description"]);
    var descId = useId();
    var describedBy = cx(props["aria-describedby"], props.description ? descId : null) || undefined;
    return h("label", { className: cx("ud-switch", props.disabled ? "is-disabled" : null, props.className) },
      h("input", Object.assign({ type: "checkbox", role: "switch" }, rest, { className: "ud-switch__input", "aria-describedby": describedBy })),
      h("span", { className: "ud-switch__track", "aria-hidden": true }, h("span", { className: "ud-switch__thumb" })),
      h("span", { className: "ud-switch__text" },
        h("span", { className: "ud-switch__label" }, props.label),
        props.description ? h("span", { className: "ud-switch__desc", id: descId }, props.description) : null));
  }

  function optionList(options) {
    return (options || []).map(function (o) { return typeof o === "string" ? { value: o, label: o } : o; });
  }

  /* The frame of a group of choices. The message is tied to the group, and a group of radios
     says so itself (role), with its required and invalid state. */
  function Fieldset(props, inner, role) {
    var base = useId();
    var legendId = props.label ? base + "-legend" : undefined;
    var msgId = props.message ? base + "-msg" : undefined;
    return h("fieldset", {
      className: cx("ud-fieldset", props.status === "error" ? "ud-fieldset--error" : null, props.className),
      role: role, "aria-labelledby": role ? legendId : undefined, "aria-describedby": msgId,
      "aria-required": role === "radiogroup" && props.required ? true : undefined,
      "aria-invalid": role === "radiogroup" && props.status === "error" ? true : undefined
    },
      props.label ? h("legend", { className: "ud-field__label", id: legendId }, props.label, props.required ? h("span", { "aria-hidden": true }, " *") : null) : null,
      inner,
      props.message ? h("p", { className: "ud-field__message", id: msgId }, props.message) : null);
  }

  function RadioGroup(props) {
    var autoName = useId();
    var name = props.name || autoName;
    var st = useControllable(props.value, props.defaultValue, props.onChange);
    return Fieldset(props, h("div", { className: cx("ud-choice-list", props.direction === "row" ? "ud-choice-list--row" : null) },
      optionList(props.options).map(function (o) {
        return h(Radio, { key: o.value, name: name, value: o.value, label: o.label, disabled: props.disabled || o.disabled, checked: st[0] === o.value, onChange: function () { st[1](o.value); } });
      })), "radiogroup");
  }

  function CheckboxGroup(props) {
    var st = useControllable(props.value, props.defaultValue || [], props.onChange);
    var values = st[0] || [];
    return Fieldset(props, h("div", { className: cx("ud-choice-list", props.direction === "row" ? "ud-choice-list--row" : null) },
      optionList(props.options).map(function (o) {
        var on = values.indexOf(o.value) >= 0;
        return h(Checkbox, { key: o.value, label: o.label, disabled: props.disabled || o.disabled, checked: on, onChange: function () { st[1](on ? values.filter(function (v) { return v !== o.value; }) : values.concat([o.value])); } });
      })));
  }

  /* Scale for survey answers (grades, clarity, ease): one row of numbered or labelled choices. */
  function ScaleField(props) {
    var autoName = useId();
    var name = props.name || autoName;
    var st = useControllable(props.value, props.defaultValue, props.onChange);
    var opts = optionList(props.options || [1, 2, 3, 4, 5].map(function (n) { return { value: String(n), label: String(n) }; }));
    return Fieldset(Object.assign({}, props, { className: cx("ud-scale-field", props.className) }), h("div", null,
      h("div", { className: "ud-scale" }, opts.map(function (o) {
        var id = name + "-" + o.value;
        return h("span", { key: o.value, className: "ud-scale__item" },
          h("input", { type: "radio", id: id, name: name, value: o.value, className: "ud-scale__input", checked: st[0] === o.value, disabled: props.disabled, onChange: function () { st[1](o.value); } }),
          h("label", { htmlFor: id, className: "ud-scale__btn" }, o.label));
      })),
      props.minLabel || props.maxLabel ? h("div", { className: "ud-scale__ends" }, h("span", null, props.minLabel), h("span", null, props.maxLabel)) : null), "radiogroup");
  }

  /* Combobox with filtering; multiple shows chosen values as Tags. */
  function Autocomplete(props) {
    var multiple = !!props.multiple;
    var t = useLabels(props);
    var listId = useId();
    var st = useControllable(props.value, props.defaultValue !== undefined ? props.defaultValue : (multiple ? [] : ""), props.onChange);
    var q = useState(""), open = useState(false), active = useState(0);
    var opts = optionList(props.options);
    var selected = multiple ? (st[0] || []) : st[0];
    var labelOf = function (v) { var f = opts.filter(function (o) { return o.value === v; })[0]; return f ? f.label : v; };
    var query = open[0] ? q[0] : (multiple ? q[0] : (selected ? labelOf(selected) : ""));
    var filtered = opts.filter(function (o) {
      if (multiple && selected.indexOf(o.value) >= 0) return false;
      return !q[0] || o.label.toLowerCase().indexOf(q[0].toLowerCase()) >= 0;
    }).slice(0, props.limit || 8);
    function choose(o) {
      if (!o) return;
      if (multiple) { st[1](selected.concat([o.value])); q[1](""); }
      else { st[1](o.value); q[1](""); open[1](false); }
      active[1](0);
    }
    function onKey(e) {
      if (e.key === "ArrowDown") { e.preventDefault(); open[1](true); active[1](Math.min(active[0] + 1, filtered.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); active[1](Math.max(active[0] - 1, 0)); }
      else if (e.key === "Enter" && open[0]) { e.preventDefault(); choose(filtered[active[0]]); }
      else if (e.key === "Escape") { open[1](false); }
      else if (e.key === "Backspace" && multiple && !q[0] && selected.length) { st[1](selected.slice(0, -1)); }
    }
    var tags = multiple ? selected.map(function (v) { return h(Tag, { key: v, onRemove: function () { st[1](selected.filter(function (x) { return x !== v; })); } }, labelOf(v)); }) : null;
    return h("div", { className: cx("ud-autocomplete", props.className) },
      fieldShell(Object.assign({}, props, { className: multiple ? "ud-field--multi" : null }), function (msgId, id) {
        return h(React.Fragment, null, tags,
          h("input", {
            id: id, className: "ud-field__control", role: "combobox", "aria-expanded": open[0], "aria-controls": open[0] ? listId : undefined, "aria-autocomplete": "list",
            "aria-activedescendant": open[0] && filtered[active[0]] ? listId + "-" + active[0] : undefined, "aria-describedby": msgId,
            placeholder: multiple && selected.length ? "" : props.placeholder, disabled: props.disabled, value: query,
            onChange: function (e) { q[1](e.target.value); open[1](true); active[1](0); },
            onFocus: function () { open[1](true); q[1](""); }, onBlur: function () { setTimeout(function () { open[1](false); }, 120); }, onKeyDown: onKey
          }));
      }, h(Icon, { name: "chevron-down", size: 16, className: "ud-field__chevron" })),
      open[0] ? h("ul", { className: "ud-listbox", id: listId, role: "listbox", "aria-label": props.label },
        filtered.length ? filtered.map(function (o, i) {
          return h("li", { key: o.value, id: listId + "-" + i, role: "option", "aria-selected": i === active[0], className: cx("ud-listbox__option", i === active[0] ? "is-active" : null),
            onMouseDown: function (e) { e.preventDefault(); choose(o); }, onMouseEnter: function () { active[1](i); } }, o.label);
        }) : h("li", { className: "ud-listbox__empty", role: "option", "aria-disabled": true, "aria-selected": false }, props.noOptionsText || t("noMatches"))) : null);
  }

  /* Drag-and-drop upload area with the chosen files listed below. */
  function FileDropzone(props) {
    var over = useState(false);
    var inputRef = useRef(null);
    var t = useLabels(props);
    var base = useId();
    var files = props.files || [];
    var labelId = props.label ? base + "-label" : null;
    var describedBy = cx(props.hint ? base + "-hint" : null, props.message ? base + "-msg" : null) || undefined;
    function take(list) { if (props.onFiles) props.onFiles(Array.prototype.slice.call(list || [])); }
    return h("div", { className: cx("ud-dropzone-wrap", props.className), role: "group", "aria-labelledby": labelId || undefined },
      props.label ? h("span", { className: "ud-field__label", id: labelId }, props.label, props.required ? " *" : "") : null,
      h("div", {
        className: cx("ud-dropzone", over[0] ? "is-over" : null, props.status === "error" ? "is-error" : null), role: "button", tabIndex: 0,
        "aria-labelledby": cx(labelId, base + "-title"), "aria-describedby": describedBy,
        onClick: function () { inputRef.current && inputRef.current.click(); },
        onKeyDown: function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current && inputRef.current.click(); } },
        onDragOver: function (e) { e.preventDefault(); over[1](true); }, onDragLeave: function () { over[1](false); },
        onDrop: function (e) { e.preventDefault(); over[1](false); take(e.dataTransfer.files); }
      },
        h(Icon, { name: "upload", size: 24 }),
        h("span", { className: "ud-dropzone__title", id: base + "-title" }, props.title || t("dropFiles")),
        props.hint ? h("span", { className: "ud-dropzone__hint", id: base + "-hint" }, props.hint) : null,
        h("input", { ref: inputRef, type: "file", hidden: true, tabIndex: -1, multiple: props.multiple, accept: props.accept, onChange: function (e) { take(e.target.files); e.target.value = ""; } })),
      props.message ? h("p", { className: cx("ud-field__message", props.status === "error" ? "is-error" : null), id: base + "-msg" }, props.message) : null,
      files.length ? h("ul", { className: "ud-filelist" }, files.map(function (f, i) {
        return h("li", { key: (f.name || "") + i, className: "ud-filelist__item" },
          h(Icon, { name: "file", size: 16 }),
          h("span", { className: "ud-filelist__name" }, f.name),
          f.size != null ? h("span", { className: "ud-filelist__size" }, formatBytes(f.size)) : null,
          f.progress != null && f.progress < 100 ? h(ProgressBar, { value: f.progress, size: "sm", label: t("uploading", { name: f.name }) }) : null,
          props.onRemove ? h("button", { type: "button", className: "ud-icon-btn", onClick: function () { props.onRemove(i); }, "aria-label": t("removeItem", { name: f.name }) }, h(Icon, { name: "trash", size: 16 })) : null);
      })) : null);
  }
  function formatBytes(n) { return n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(0) + " KB" : (n / 1048576).toFixed(1) + " MB"; }

  /* ---------- Data display ---------- */
  function StatusBadge(props) {
    return h("span", { className: cx("ud-badge", "ud-badge--" + (props.tone || "neutral"), props.className) },
      props.dot !== false ? h("span", { className: "ud-badge__dot", "aria-hidden": true }) : null, props.children);
  }

  function Avatar(props) {
    var initials = (props.name || "").split(/\s+/).filter(Boolean).slice(0, 2).map(function (p) { return p[0]; }).join("").toUpperCase();
    return h("span", { className: cx("ud-avatar", props.size === "lg" ? "ud-avatar--lg" : props.size === "sm" ? "ud-avatar--sm" : null, props.className), title: props.name },
      props.src ? h("img", { src: props.src, alt: props.name || "" }) : h("span", { "aria-hidden": !!props.name }, initials || "?"),
      props.src ? null : h("span", { className: "ud-sr" }, props.name));
  }

  function Card(props) {
    var rest = omit(props, ["className", "title", "subtitle", "actions", "children", "padding"]);
    return h("section", Object.assign({}, rest, { className: cx("ud-card", props.padding === "none" ? "ud-card--flush" : null, props.className) }),
      props.title || props.actions ? h("header", { className: "ud-card__head" },
        h("div", null, props.title ? h("h3", { className: "ud-card__title" }, props.title) : null, props.subtitle ? h("p", { className: "ud-card__subtitle" }, props.subtitle) : null),
        props.actions ? h("div", { className: "ud-card__actions" }, props.actions) : null) : null,
      props.children);
  }

  function DescriptionList(props) {
    return h("dl", { className: cx("ud-dl", props.columns === 2 ? "ud-dl--2" : null, props.className) },
      (props.items || []).map(function (it, i) { return h("div", { key: i, className: "ud-dl__row" }, h("dt", null, it.label), h("dd", null, it.value == null || it.value === "" ? "—" : it.value)); }));
  }

  function EmptyState(props) {
    return h("div", { className: cx("ud-empty", props.className) },
      h("span", { className: "ud-empty__icon" }, h(Icon, { name: props.icon || "inbox", size: 28 })),
      h("p", { className: "ud-empty__title" }, props.title),
      props.description ? h("p", { className: "ud-empty__desc" }, props.description) : null,
      props.action || null);
  }

  function Skeleton(props) {
    var lines = props.lines || 1;
    var out = [];
    for (var i = 0; i < lines; i++) out.push(h("span", { key: i, className: cx("ud-skeleton", props.variant === "circle" ? "ud-skeleton--circle" : null), style: { width: props.variant === "circle" ? props.size || 40 : (i === lines - 1 && lines > 1 ? "60%" : props.width || "100%"), height: props.variant === "circle" ? props.size || 40 : props.height || 14 } }));
    return h("span", { className: cx("ud-skeleton-group", props.className), "aria-hidden": true }, out);
  }

  function Spinner(props) {
    var t = useLabels(props);
    return h("span", { className: cx("ud-spinner", props.size === "sm" ? "ud-spinner--sm" : null, props.className), role: "status" }, h("span", { className: "ud-sr" }, props.label || t("loading")));
  }

  /* Shown on hover and focus, kept while the pointer is on the bubble, hidden by Escape until the
     pointer or the focus leaves (WCAG 1.4.13, 2.2.0). */
  function Tooltip(props) {
    var id = useId();
    var hovered = useState(false), focused = useState(false), dismissed = useState(false);
    var shown = hovered[0] || focused[0];
    var child = React.Children.only(props.children);
    useEffect(function () {
      if (!shown || dismissed[0]) return;
      function key(e) { if (e.key === "Escape") dismissed[1](true); }
      document.addEventListener("keydown", key);
      return function () { document.removeEventListener("keydown", key); };
    }, [shown, dismissed[0]]);
    /* Escape holds until neither the pointer nor the focus is on it any more. */
    useEffect(function () { if (!shown && dismissed[0]) dismissed[1](false); }, [shown, dismissed[0]]);
    return h("span", { className: cx("ud-tooltip", props.placement === "bottom" ? "ud-tooltip--bottom" : null, dismissed[0] ? "is-dismissed" : null),
      onMouseEnter: function () { hovered[1](true); }, onMouseLeave: function () { hovered[1](false); },
      onFocus: function () { focused[1](true); }, onBlur: function () { focused[1](false); } },
      React.cloneElement(child, { "aria-describedby": id }),
      h("span", { className: "ud-tooltip__bubble", role: "tooltip", id: id }, props.title));
  }

  function ProgressBar(props) {
    var v = Math.max(0, Math.min(100, props.value || 0));
    return h("div", { className: cx("ud-progress", props.size === "sm" ? "ud-progress--sm" : null, props.className) },
      props.showLabel ? h("div", { className: "ud-progress__top" }, h("span", null, props.label), h("span", null, Math.round(v) + "%")) : null,
      h("div", { className: "ud-progress__track", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": Math.round(v), "aria-label": props.label },
        h("span", { className: "ud-progress__bar", style: { width: v + "%" } })));
  }

  /* Table with sortable columns, row selection and a slot for pagination. columns: [{key, header, sortable, align, width, render(row)}] */
  function DataTable(props) {
    var columns = props.columns || [], rows = props.rows || [];
    var t = useLabels(props);
    var sortSt = useControllable(props.sort, props.defaultSort || null, props.onSortChange);
    var sel = useControllable(props.selected, [], props.onSelectionChange);
    var sort = sortSt[0];
    var rowKey = props.rowKey || "id";
    var view = rows;
    if (sort && !props.manualSort) {
      view = rows.slice().sort(function (a, b) {
        var x = a[sort.key], y = b[sort.key];
        var r = x == null ? -1 : y == null ? 1 : typeof x === "number" ? x - y : String(x).localeCompare(String(y), "sr");
        return sort.direction === "desc" ? -r : r;
      });
    }
    var allOn = view.length > 0 && view.every(function (r) { return sel[0].indexOf(r[rowKey]) >= 0; });
    function toggle(id) { sel[1](sel[0].indexOf(id) >= 0 ? sel[0].filter(function (x) { return x !== id; }) : sel[0].concat([id])); }
    var head = h("tr", null,
      props.selectable ? h("th", { className: "ud-table__check", scope: "col" }, h(Checkbox, { "aria-label": t("selectAllRows"), checked: allOn, onChange: function () { sel[1](allOn ? [] : view.map(function (r) { return r[rowKey]; })); } })) : null,
      columns.map(function (c) {
        var active = sort && sort.key === c.key;
        var ariaSort = active ? (sort.direction === "desc" ? "descending" : "ascending") : c.sortable ? "none" : undefined;
        return h("th", { key: c.key, scope: "col", style: { width: c.width, textAlign: c.align }, "aria-sort": ariaSort },
          c.sortable ? h("button", { type: "button", className: cx("ud-table__sort", active ? "is-active" : null), onClick: function () {
            sortSt[1](!active ? { key: c.key, direction: "asc" } : sort.direction === "asc" ? { key: c.key, direction: "desc" } : null);
          } }, c.header, h(Icon, { name: active ? (sort.direction === "desc" ? "chevron-down" : "chevron-up") : "chevrons-up-down", size: 14 })) : c.header);
      }));
    var body;
    var span = columns.length + (props.selectable ? 1 : 0);
    if (props.loading) {
      body = [0, 1, 2].map(function (i) { return h("tr", { key: "sk" + i }, props.selectable ? h("td", null) : null, columns.map(function (c) { return h("td", { key: c.key }, h(Skeleton, null)); })); });
    } else if (!view.length && props.filtered) {
      /* Nothing matches the filters: say so, and offer to clear them (2.3.0). */
      body = h("tr", null, h("td", { colSpan: span }, h(EmptyState, { icon: "search", title: t("noResults"),
        action: props.onClearFilters ? h(TextButton, { icon: "x", onClick: props.onClearFilters }, t("clearFilters")) : null })));
    } else if (!view.length) {
      body = h("tr", null, h("td", { colSpan: span }, props.empty || h(EmptyState, { title: t("nothingHere"), action: props.emptyAction || null })));
    } else {
      body = view.map(function (r) {
        var id = r[rowKey], on = sel[0].indexOf(id) >= 0;
        return h("tr", { key: id, className: cx(on ? "is-selected" : null, props.onRowClick ? "is-clickable" : null), onClick: props.onRowClick ? function () { props.onRowClick(r); } : undefined },
          props.selectable ? h("td", { className: "ud-table__check", onClick: function (e) { e.stopPropagation(); } }, h(Checkbox, { "aria-label": t("selectRow"), checked: on, onChange: function () { toggle(id); } })) : null,
          columns.map(function (c) { return h("td", { key: c.key, style: { textAlign: c.align } }, c.render ? c.render(r) : r[c.key]); }));
      });
    }
    /* Loading is announced: the table is busy, and a status line (always there, so that a screen
       reader hears it change) says so (2.3.0). */
    return h("div", { className: cx("ud-table-wrap", props.className) },
      props.toolbar ? h("div", { className: "ud-table__toolbar" }, props.toolbar) : null,
      h("p", { className: "ud-sr", role: "status" }, props.loading ? t("loading") : ""),
      h("div", { className: "ud-table__scroll" }, h("table", { className: "ud-table", "aria-busy": props.loading ? true : undefined }, props.caption ? h("caption", { className: "ud-sr" }, props.caption) : null, h("thead", null, head), h("tbody", null, body))),
      props.footer ? h("div", { className: "ud-table__footer" }, props.footer) : null);
  }

  function Pagination(props) {
    var page = props.page || 1, size = props.pageSize || 10, total = props.total || 0;
    var t = useLabels(props);
    var pages = Math.max(1, Math.ceil(total / size));
    var from = total ? (page - 1) * size + 1 : 0, to = Math.min(total, page * size);
    var nums = [];
    for (var p = 1; p <= pages; p++) { if (p === 1 || p === pages || Math.abs(p - page) <= 1) nums.push(p); else if (nums[nums.length - 1] !== "…") nums.push("…"); }
    function go(p) { if (p >= 1 && p <= pages && p !== page && props.onPageChange) props.onPageChange(p); }
    return h("nav", { className: cx("ud-pagination", props.className), "aria-label": t("pagination") },
      h("span", { className: "ud-pagination__range" }, t("pageRange", { from: from, to: to, total: total })),
      props.pageSizeOptions ? h("label", { className: "ud-pagination__size" }, t("rowsPerPage"),
        h("select", { value: size, onChange: function (e) { if (props.onPageSizeChange) props.onPageSizeChange(Number(e.target.value)); } },
          props.pageSizeOptions.map(function (n) { return h("option", { key: n, value: n }, n); }))) : null,
      h("div", { className: "ud-pagination__pages" },
        h("button", { type: "button", className: "ud-page-btn", disabled: page <= 1, onClick: function () { go(page - 1); }, "aria-label": t("previousPage") }, h(Icon, { name: "chevron-left", size: 16 })),
        nums.map(function (n, i) { return n === "…" ? h("span", { key: "e" + i, className: "ud-page-ellipsis" }, "…") : h("button", { key: n, type: "button", className: cx("ud-page-btn", n === page ? "is-current" : null), "aria-current": n === page ? "page" : undefined, onClick: function () { go(n); } }, n); }),
        h("button", { type: "button", className: "ud-page-btn", disabled: page >= pages, onClick: function () { go(page + 1); }, "aria-label": t("nextPage") }, h(Icon, { name: "chevron-right", size: 16 }))));
  }

  /* ---------- Feedback ---------- */
  var ALERT_ICON = { info: "info", success: "check-circle-2", warning: "alert-triangle", error: "alert-circle" };
  /* What can take the focus by Tab, in document order. */
  var TABBABLE = "a[href], button:not([disabled]), input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
  function shown(el) {
    if (el.closest("[hidden], [inert]") || getComputedStyle(el).visibility === "hidden") return false;
    for (var n = el; n && n.nodeType === 1; n = n.parentElement) { if (getComputedStyle(n).display === "none") return false; }
    return true;
  }
  /* The part of the page that takes the focus when `gone` leaves it: the next control after it, or
     the one before it. compareDocumentPosition: 4 = follows, 2 = precedes. */
  function focusAfter(gone) {
    var all = Array.prototype.filter.call(gone.ownerDocument.querySelectorAll(TABBABLE), function (el) { return !gone.contains(el) && shown(el); });
    var next = all.filter(function (el) { return gone.compareDocumentPosition(el) & 4; })[0];
    var before = all.filter(function (el) { return gone.compareDocumentPosition(el) & 2; });
    return next || before[before.length - 1] || null;
  }
  /* A dismissed alert hands the focus on to the next control (the one before it at the end of the
     page) instead of dropping it to the page (2.3.0). Nothing is moved when the owner keeps the alert
     or puts the focus somewhere itself. */
  function Alert(props) {
    var tone = props.tone || "info";
    var t = useLabels(props);
    var root = useRef(null);
    function dismiss(e) {
      var el = root.current;
      var target = el && el.contains(e.currentTarget.ownerDocument.activeElement) ? focusAfter(el) : null;
      props.onClose(e);
      if (target) setTimeout(function () {
        var doc = target.ownerDocument, active = doc.activeElement;
        if ((!active || active === doc.body || !active.isConnected) && target.isConnected) target.focus();
      }, 0);
    }
    return h("div", { ref: root, className: cx("ud-alert", "ud-alert--" + tone, props.className), role: tone === "error" || tone === "warning" ? "alert" : "status" },
      h(Icon, { name: ALERT_ICON[tone], size: 18, className: "ud-alert__icon" }),
      h("div", { className: "ud-alert__body" }, props.title ? h("p", { className: "ud-alert__title" }, props.title) : null, props.children ? h("div", { className: "ud-alert__text" }, props.children) : null),
      props.action || null,
      props.onClose ? h("button", { type: "button", className: "ud-icon-btn", onClick: dismiss, "aria-label": t("dismiss") }, h(Icon, { name: "x", size: 16 })) : null);
  }

  /* Toasts: render <ToastHost/> once, then call Udekom.toast({title, tone}). */
  var toastListeners = [], toastSeq = 0;
  function toast(opts) {
    var t = Object.assign({ id: ++toastSeq, tone: "success", duration: 4000 }, typeof opts === "string" ? { title: opts } : opts);
    toastListeners.forEach(function (fn) { fn(t); });
    return t.id;
  }
  /* A toast goes by itself after its duration, but never while the pointer is on the toasts or the
     focus is in them: its time stops and runs on when both have left (WCAG 2.2.1, 2.3.0). An error
     toast stays until it is dismissed; an error belongs in an Alert in the page (README). */
  function ToastHost(props) {
    var st = useState([]);
    var tl = useLabels(props);
    var timers = useRef({}), held = useRef({ pointer: false, focus: false }), region = useRef(null), cameFrom = useRef(null);
    /* After a render: a dismissed toast took the focus with it. The focus goes back to where it was
       before it came to the toasts, and the time of the others runs on. */
    useEffect(function () {
      var el = region.current;
      if (!el || !held.current.focus) return;
      var doc = el.ownerDocument, active = doc.activeElement;
      if (el.contains(active)) return;
      if ((!active || active === doc.body) && cameFrom.current && cameFrom.current.isConnected) cameFrom.current.focus();
      hold("focus", false);
    });
    function remove(id) {
      var timer = timers.current[id];
      if (timer) { clearTimeout(timer.handle); delete timers.current[id]; }
      /* The keys of `timers` are strings; an id may come from them. */
      st[1](function (list) { return list.filter(function (x) { return String(x.id) !== String(id); }); });
    }
    function run(id) {
      var timer = timers.current[id];
      if (!timer || timer.handle || held.current.pointer || held.current.focus) return;
      timer.started = Date.now();
      timer.handle = setTimeout(function () { remove(id); }, timer.left);
    }
    function pause(id) {
      var timer = timers.current[id];
      if (!timer || !timer.handle) return;
      clearTimeout(timer.handle); timer.handle = null;
      timer.left = Math.max(0, timer.left - (Date.now() - timer.started));
    }
    function hold(what, on) {
      held.current[what] = on;
      for (var id in timers.current) { if (held.current.pointer || held.current.focus) pause(id); else run(id); }
    }
    useEffect(function () {
      function add(t) {
        st[1](function (list) { return list.concat([t]); });
        if (t.duration && t.tone !== "error") { timers.current[t.id] = { left: t.duration, handle: null }; run(t.id); }
      }
      toastListeners.push(add);
      return function () {
        toastListeners = toastListeners.filter(function (f) { return f !== add; });
        for (var id in timers.current) clearTimeout(timers.current[id].handle);
      };
    }, []);
    return h("div", { ref: region, className: cx("ud-toasts", props.position === "top" ? "ud-toasts--top" : null), "aria-live": "polite",
      onMouseEnter: function () { hold("pointer", true); }, onMouseLeave: function () { hold("pointer", false); },
      onFocus: function (e) { if (!held.current.focus) cameFrom.current = e.relatedTarget; hold("focus", true); },
      onBlur: function (e) { if (!e.currentTarget.contains(e.relatedTarget)) hold("focus", false); } },
      st[0].map(function (t) {
        return h("div", { key: t.id, className: cx("ud-toast", "ud-toast--" + t.tone), role: t.tone === "error" ? "alert" : "status" },
          h(Icon, { name: ALERT_ICON[t.tone] || "info", size: 18 }),
          h("div", { className: "ud-toast__body" }, h("p", { className: "ud-toast__title" }, t.title), t.description ? h("p", { className: "ud-toast__desc" }, t.description) : null),
          h("button", { type: "button", className: "ud-icon-btn ud-icon-btn--on-dark", "aria-label": tl("dismiss"), onClick: function () { remove(t.id); } }, h(Icon, { name: "x", size: 14 })));
      }));
  }

  function useModalBehaviour(open, onClose, panelRef) {
    useEffect(function () {
      if (!open) return;
      var prev = document.activeElement;
      var panel = panelRef.current;
      var first = panel && panel.querySelector("input, select, textarea, button:not([data-close]), [href], [tabindex]:not([tabindex='-1'])");
      (first || panel) && (first || panel).focus();
      function onKey(e) {
        if (e.key === "Escape" && onClose) { e.stopPropagation(); onClose(); }
        if (e.key === "Tab" && panel) {
          var f = panel.querySelectorAll("input, select, textarea, button, [href], [tabindex]:not([tabindex='-1'])");
          if (!f.length) return;
          var a = f[0], z = f[f.length - 1];
          if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
          else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
        }
      }
      document.addEventListener("keydown", onKey);
      var ov = document.body.style.overflow; document.body.style.overflow = "hidden";
      return function () { document.removeEventListener("keydown", onKey); document.body.style.overflow = ov; if (prev && prev.focus) prev.focus(); };
    }, [open]);
  }

  function Dialog(props) {
    var panel = useRef(null);
    var titleId = useId();
    var t = useLabels(props);
    useModalBehaviour(props.open, props.onClose, panel);
    if (!props.open) return null;
    return h("div", { className: "ud-overlay", onMouseDown: function (e) { if (e.target === e.currentTarget && props.onClose && props.dismissible !== false) props.onClose(); } },
      h("div", { ref: panel, className: cx("ud-dialog", props.size ? "ud-dialog--" + props.size : null, props.className), role: props.role || "dialog", "aria-modal": true, "aria-labelledby": titleId, "aria-describedby": props["aria-describedby"], tabIndex: -1 },
        h("header", { className: "ud-dialog__head" },
          h("h2", { id: titleId, className: "ud-dialog__title" }, props.title),
          props.onClose ? h("button", { type: "button", className: "ud-icon-btn", "data-close": true, onClick: props.onClose, "aria-label": t("close") }, h(Icon, { name: "x", size: 18 })) : null),
        h("div", { className: "ud-dialog__body" }, props.children),
        props.actions ? h("footer", { className: "ud-dialog__actions" }, props.actions) : null));
  }

  /* An alert dialog is named by its title and described by its text, so a screen reader reads the
     consequence with the question (2.3.0). */
  function ConfirmDialog(props) {
    var t = useLabels(props);
    var textId = useId();
    return h(Dialog, { open: props.open, onClose: props.onCancel, title: props.title, size: "sm", role: "alertdialog", labels: props.labels, "aria-describedby": props.children ? textId : undefined,
      actions: h(React.Fragment, null,
        h("button", { type: "button", className: "ud-text-btn", onClick: props.onCancel }, props.cancelText || t("cancel")),
        h(Button, { variant: props.destructive ? "danger" : "primary", onClick: props.onConfirm, disabled: props.busy }, props.busy ? h(Spinner, { size: "sm", label: t("working") }) : null, props.confirmText || t("confirm"))) },
      props.children ? h("p", { id: textId, className: "ud-dialog__text" }, props.children) : null);
  }

  function Drawer(props) {
    var panel = useRef(null);
    var titleId = useId();
    var t = useLabels(props);
    useModalBehaviour(props.open, props.onClose, panel);
    if (!props.open) return null;
    return h("div", { className: "ud-overlay ud-overlay--drawer", onMouseDown: function (e) { if (e.target === e.currentTarget && props.onClose) props.onClose(); } },
      h("aside", { ref: panel, className: cx("ud-drawer", props.side === "left" ? "ud-drawer--left" : null, props.className), role: "dialog", "aria-modal": true, "aria-labelledby": titleId, tabIndex: -1, style: props.width ? { width: props.width } : null },
        h("header", { className: "ud-dialog__head" }, h("h2", { id: titleId, className: "ud-dialog__title" }, props.title),
          h("button", { type: "button", className: "ud-icon-btn", "data-close": true, onClick: props.onClose, "aria-label": t("close") }, h(Icon, { name: "x", size: 18 }))),
        h("div", { className: "ud-drawer__body" }, props.children),
        props.actions ? h("footer", { className: "ud-dialog__actions" }, props.actions) : null));
  }

  /* ---------- Navigation ---------- */
  function Tabs(props) {
    var st = useControllable(props.value, props.defaultValue || (props.items && props.items[0] && props.items[0].value), props.onChange);
    var items = props.items || [];
    var base = useId();
    function onKey(e, i) {
      var n = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : null;
      if (n === null) return;
      e.preventDefault(); n = (n + items.length) % items.length; st[1](items[n].value);
      var el = document.getElementById(base + "-tab-" + n); el && el.focus();
    }
    var currentIndex = -1;
    for (var ci = 0; ci < items.length; ci++) { if (items[ci].value === st[0]) currentIndex = ci; }
    var current = currentIndex >= 0 ? items[currentIndex] : null;
    var hasPanel = !!current && current.content !== undefined;
    return h("div", { className: cx("ud-tabs-u", props.className) },
      h("div", { className: "ud-tabs-u__list", role: "tablist", "aria-label": props.label },
        items.map(function (it, i) {
          var on = it.value === st[0];
          return h("button", { key: it.value, id: base + "-tab-" + i, type: "button", role: "tab", "aria-selected": on, "aria-controls": on && hasPanel ? base + "-panel" : undefined, tabIndex: on ? 0 : -1,
            className: cx("ud-tabs-u__tab", on ? "is-selected" : null), onClick: function () { st[1](it.value); }, onKeyDown: function (e) { onKey(e, i); } },
            it.label, it.count != null ? h("span", { className: "ud-tabs-u__count" }, it.count) : null);
        })),
      hasPanel ? h("div", { id: base + "-panel", role: "tabpanel", "aria-labelledby": base + "-tab-" + currentIndex, className: "ud-tabs-u__panel", tabIndex: 0 }, current.content) : null);
  }

  function Breadcrumbs(props) {
    var items = props.items || [];
    var t = useLabels(props);
    return h("nav", { className: cx("ud-breadcrumbs", props.className), "aria-label": t("breadcrumb") },
      h("ol", null, items.map(function (it, i) {
        var last = i === items.length - 1;
        return h("li", { key: i }, last ? h("span", { "aria-current": "page" }, it.label) : h("a", { href: it.href, onClick: it.onClick }, it.label),
          last ? null : h(Icon, { name: "chevron-right", size: 14 }));
      })));
  }

  /* Steps of a long form. steps: [{label, description}], current index; completed steps show a check. */
  function Stepper(props) {
    var steps = props.steps || [], cur = props.current || 0;
    return h("ol", { className: cx("ud-stepper", props.orientation === "vertical" ? "ud-stepper--vertical" : null, props.className) },
      steps.map(function (s, i) {
        var state = i < cur ? "done" : i === cur ? "current" : "todo";
        var inner = h(React.Fragment, null,
          h("span", { className: "ud-stepper__dot" }, state === "done" ? h(Icon, { name: "check", size: 14, strokeWidth: 3 }) : i + 1),
          h("span", { className: "ud-stepper__text" }, h("span", { className: "ud-stepper__label" }, s.label), s.description ? h("span", { className: "ud-stepper__desc" }, s.description) : null));
        return h("li", { key: i, className: cx("ud-stepper__step", "is-" + state), "aria-current": state === "current" ? "step" : undefined },
          props.onStepClick && state === "done" ? h("button", { type: "button", className: "ud-stepper__btn", onClick: function () { props.onStepClick(i); } }, inner) : h("span", { className: "ud-stepper__btn" }, inner));
      }));
  }

  /* Dropdown menu for row actions. items: [{label, icon, onSelect, danger, disabled}] */
  function Menu(props) {
    var open = useState(false);
    var wrap = useRef(null);
    var id = useId();
    var t = useLabels(props);
    /* Escape and a choice give the focus back to the trigger (2.2.0); a click elsewhere leaves it where it went. */
    function backToTrigger() {
      var trigger = wrap.current && wrap.current.querySelector("[aria-haspopup=menu]");
      if (trigger) trigger.focus();
    }
    useEffect(function () {
      if (!open[0]) return;
      function off(e) { if (wrap.current && !wrap.current.contains(e.target)) open[1](false); }
      function key(e) { if (e.key === "Escape") { open[1](false); backToTrigger(); } }
      document.addEventListener("mousedown", off); document.addEventListener("keydown", key);
      var first = wrap.current && wrap.current.querySelector("[role=menuitem]"); first && first.focus();
      return function () { document.removeEventListener("mousedown", off); document.removeEventListener("keydown", key); };
    }, [open[0]]);
    function moveFocus(e) {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      var items = Array.prototype.slice.call(wrap.current.querySelectorAll("[role=menuitem]:not([disabled])"));
      var i = items.indexOf(document.activeElement) + (e.key === "ArrowDown" ? 1 : -1);
      items[(i + items.length) % items.length].focus();
    }
    var trigger = props.trigger ? React.cloneElement(props.trigger, { onClick: function () { open[1](!open[0]); }, "aria-haspopup": "menu", "aria-expanded": open[0], "aria-controls": open[0] ? id : undefined })
      : h("button", { type: "button", className: "ud-icon-btn", onClick: function () { open[1](!open[0]); }, "aria-haspopup": "menu", "aria-expanded": open[0], "aria-controls": open[0] ? id : undefined, "aria-label": props.label || t("moreActions") }, h(Icon, { name: "more", size: 18 }));
    return h("div", { ref: wrap, className: cx("ud-menu", props.align === "start" ? "ud-menu--start" : null, props.className), onClick: function (e) { e.stopPropagation(); } },
      trigger,
      open[0] ? h("div", { id: id, role: "menu", className: "ud-menu__list", onKeyDown: moveFocus },
        (props.items || []).map(function (it, i) {
          if (it.divider) return h("hr", { key: i, className: "ud-menu__divider" });
          return h("button", { key: i, type: "button", role: "menuitem", disabled: it.disabled, className: cx("ud-menu__item", it.danger ? "is-danger" : null),
            onClick: function () { open[1](false); backToTrigger(); if (it.onSelect) it.onSelect(); } }, it.icon ? h(Icon, { name: it.icon, size: 16 }) : null, it.label);
        })) : null);
  }

  function SidebarNav(props) {
    var t = useLabels(props);
    return h("nav", { className: cx("ud-sidenav", props.className), "aria-label": props.label || t("mainNavigation") },
      (props.sections || [{ items: props.items || [] }]).map(function (sec, si) {
        return h("div", { key: si, className: "ud-sidenav__section" },
          sec.title ? h("p", { className: "ud-sidenav__title" }, sec.title) : null,
          h("ul", null, sec.items.map(function (it, i) {
            var on = it.value !== undefined && it.value === props.value;
            return h("li", { key: i }, h("a", { href: it.href || "#", className: cx("ud-sidenav__link", on ? "is-current" : null), "aria-current": on ? "page" : undefined,
              onClick: function (e) { if (props.onNavigate) { e.preventDefault(); props.onNavigate(it.value, it); } } },
              it.icon ? h(Icon, { name: it.icon, size: 18 }) : null, h("span", null, it.label), it.badge != null ? h("span", { className: "ud-sidenav__badge" }, it.badge) : null));
          })));
      }));
  }

  /* Admin layout: dark sidebar with logo and nav, top bar, content. On narrow screens the sidebar becomes a drawer. */
  /* On narrow screens the open drawer behaves as the Drawer does: the focus goes into it, Tab stays
     inside, Escape and the scrim close it, and the focus goes back to the menu button (2.2.0). */
  function AppShell(props) {
    var open = useState(false);
    var t = useLabels(props);
    var side = useRef(null);
    useModalBehaviour(open[0], function () { open[1](false); }, side);
    return h("div", { className: cx("ud-shell", props.className) },
      h("aside", { ref: side, className: cx("ud-shell__side", open[0] ? "is-open" : null) },
        h("div", { className: "ud-shell__brand" }, props.logo || null, props.product ? h("span", { className: "ud-shell__product" }, props.product) : null),
        props.sidebar),
      open[0] ? h("div", { className: "ud-shell__scrim", onClick: function () { open[1](false); } }) : null,
      h("div", { className: "ud-shell__main" },
        h("header", { className: "ud-shell__top" },
          h("button", { type: "button", className: "ud-icon-btn ud-shell__menu", onClick: function () { open[1](!open[0]); }, "aria-label": t("openNavigation"), "aria-expanded": open[0] }, h(Icon, { name: "menu", size: 20 })),
          h("div", { className: "ud-shell__topbar" }, props.topbar)),
        h("main", { className: "ud-shell__content" }, props.children)));
  }

  /* Page heading with breadcrumbs and actions. */
  function PageHeader(props) {
    return h("div", { className: cx("ud-page-head", props.className) },
      props.breadcrumbs ? h(Breadcrumbs, { items: props.breadcrumbs }) : null,
      h("div", { className: "ud-page-head__row" },
        h("div", null, h("h1", { className: "ud-page-head__title" }, props.title), props.description ? h("p", { className: "ud-page-head__desc" }, props.description) : null),
        props.actions ? h("div", { className: "ud-page-head__actions" }, props.actions) : null));
  }

  /* ---------- Patterns ---------- */
  /* Repeating rows of fields, e.g. co-authors or education levels. renderRow(item, index, update).
     Removing a row removes the button that had the focus. The focus then goes to the first control
     of the row that takes its place (the row before it when the last one was removed), or to the
     "add" button when no row is left, so a keyboard user stays in the repeater (version 2.0.1). */
  var REPEATER_FOCUSABLE = "input:not([type=hidden]):not([hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])";
  function Repeater(props) {
    var items = props.items || [];
    var max = props.max || Infinity, min = props.min || 0;
    var t = useLabels(props);
    var base = useId();
    var root = useRef(null);
    var removed = useRef(null);
    useEffect(function () {
      var was = removed.current;
      if (!was) return;
      removed.current = null;
      var el = root.current;
      /* Nothing to do when the row is still there (the owner refused the change) or the focus is
         somewhere on purpose: only a focus that fell back to the page is brought home. */
      if (!el || items.length >= was.length) return;
      var active = document.activeElement;
      if (active && active !== document.body && active !== document.documentElement) return;
      var rows = [], add = null;
      for (var c = 0; c < el.children.length; c++) {
        var name = " " + el.children[c].className + " ";
        if (name.indexOf(" ud-repeater__row ") >= 0) rows.push(el.children[c]);
        else if (name.indexOf(" ud-text-btn--add ") >= 0) add = el.children[c];
      }
      var row = rows.length ? rows[Math.min(was.index, rows.length - 1)] : null;
      var target = (row && row.querySelector(REPEATER_FOCUSABLE)) || add;
      if (!target) { el.setAttribute("tabindex", "-1"); target = el; }
      target.focus();
    });
    return h("div", { ref: root, className: cx("ud-repeater", props.className), role: "group", "aria-labelledby": props.label ? base + "-label" : undefined, "aria-describedby": props.message ? base + "-msg" : undefined },
      props.label ? h("p", { className: "ud-field__label", id: base + "-label" }, props.label) : null,
      items.map(function (it, i) {
        return h("div", { key: it.key || i, className: "ud-repeater__row" },
          h("div", { className: "ud-repeater__index", "aria-hidden": true }, i + 1),
          h("div", { className: "ud-repeater__fields" }, props.renderRow(it, i, function (patch) { var next = items.slice(); next[i] = Object.assign({}, it, patch); props.onChange(next); })),
          items.length > min ? h("button", { type: "button", className: "ud-icon-btn", onClick: function () { removed.current = { index: i, length: items.length }; props.onChange(items.filter(function (_, j) { return j !== i; })); }, "aria-label": props.removeLabel ? props.removeLabel + " " + (i + 1) : t("removeRow", { index: i + 1 }) }, h(Icon, { name: "trash", size: 16 })) : null);
      }),
      items.length < max ? h("button", { type: "button", className: "ud-text-btn ud-text-btn--add", onClick: function () { props.onChange(items.concat([Object.assign({ key: Date.now() }, props.newItem ? props.newItem() : {})])); } }, h(Icon, { name: "plus", size: 16 }), props.addLabel || t("addRow")) : null,
      props.message ? h("p", { className: "ud-field__message", id: base + "-msg" }, props.message) : null);
  }

  /* Roles × permissions grid. value: {roleId: [permission,...]} */
  function PermissionMatrix(props) {
    var roles = props.roles || [], perms = props.permissions || [], value = props.value || {};
    var t = useLabels(props);
    function toggle(role, perm) {
      var cur = value[role] || [];
      var next = Object.assign({}, value);
      next[role] = cur.indexOf(perm) >= 0 ? cur.filter(function (p) { return p !== perm; }) : cur.concat([perm]);
      if (props.onChange) props.onChange(next);
    }
    return h("div", { className: cx("ud-table-wrap", props.className) }, h("div", { className: "ud-table__scroll" },
      h("table", { className: "ud-table ud-matrix" },
        h("thead", null, h("tr", null, h("th", { scope: "col" }, t("permission")), roles.map(function (r) { return h("th", { key: r.id, scope: "col", className: "ud-matrix__role" }, r.name); }))),
        h("tbody", null, perms.map(function (p) {
          return h("tr", { key: p.name }, h("th", { scope: "row" }, h("span", { className: "ud-matrix__perm" }, p.label || p.name), p.description ? h("span", { className: "ud-matrix__desc" }, p.description) : null),
            roles.map(function (r) {
              var locked = r.locked;
              return h("td", { key: r.id, className: "ud-matrix__cell" }, h(Checkbox, { "aria-label": t("rolePermission", { role: r.name, permission: p.label || p.name }), checked: locked || (value[r.id] || []).indexOf(p.name) >= 0, disabled: locked || props.disabled, onChange: function () { toggle(r.id, p.name); } }));
            }));
        })))));
  }

  /* Row of filters above a table: search, selects, reset. */
  function FilterBar(props) {
    var t = useLabels(props);
    return h("div", { className: cx("ud-filterbar", props.className) },
      h("div", { className: "ud-filterbar__fields" }, props.children),
      props.onReset ? h("button", { type: "button", className: "ud-text-btn", onClick: props.onReset }, props.resetLabel || t("clearFilters")) : null,
      props.actions ? h("div", { className: "ud-filterbar__actions" }, props.actions) : null);
  }

  function TextButton(props) {
    var rest = omit(props, ["className", "icon", "children", "tone"]);
    return h("button", Object.assign({ type: "button" }, rest, { className: cx("ud-text-btn", props.tone === "danger" ? "ud-text-btn--danger" : null, props.className) }), props.icon ? h(Icon, { name: props.icon, size: 16 }) : null, props.children);
  }

  function IconButton(props) {
    var rest = omit(props, ["className", "icon", "label", "size"]);
    return h("button", Object.assign({ type: "button", "aria-label": props.label, title: props.label }, rest, { className: cx("ud-icon-btn", props.className) }), h(Icon, { name: props.icon, size: props.size || 18 }));
  }

  var EXT = {
    NumberField: NumberField, DateField: DateField, PasswordField: PasswordField, SearchField: SearchField, Switch: Switch,
    RadioGroup: RadioGroup, CheckboxGroup: CheckboxGroup, ScaleField: ScaleField, Autocomplete: Autocomplete, FileDropzone: FileDropzone,
    TextButton: TextButton, IconButton: IconButton,
    DataTable: DataTable, Pagination: Pagination, StatusBadge: StatusBadge, Avatar: Avatar, Card: Card, DescriptionList: DescriptionList,
    EmptyState: EmptyState, Skeleton: Skeleton, Spinner: Spinner, Tooltip: Tooltip, ProgressBar: ProgressBar,
    Alert: Alert, ToastHost: ToastHost, toast: toast, Dialog: Dialog, ConfirmDialog: ConfirmDialog, Drawer: Drawer,
    Tabs: Tabs, Breadcrumbs: Breadcrumbs, Stepper: Stepper, Menu: Menu, SidebarNav: SidebarNav, AppShell: AppShell, PageHeader: PageHeader,
    Repeater: Repeater, PermissionMatrix: PermissionMatrix, FilterBar: FilterBar,
    LabelsProvider: LabelsProvider, defaultLabels: DEFAULT_LABELS, version: "2.3.0"
  };

  window.Udekom = {
    Button: Button, CircleButton: CircleButton, ArrowButton: ArrowButton, NavLink: NavLink,
    SegmentedTabs: SegmentedTabs, TextField: TextField, Select: Select, Textarea: Textarea,
    Checkbox: Checkbox, Radio: Radio, Tag: Tag, FileButton: FileButton, FormCard: FormCard, Icon: Icon
  };
  Object.assign(window.Udekom, EXT);
})();
