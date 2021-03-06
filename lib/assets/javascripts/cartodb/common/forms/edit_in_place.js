
cdb.admin.EditInPlace = cdb.core.View.extend({

  events: {
    "click .value": "_onClick",
    "keyup input":  "_onKeyUp",
    "blur input":   "_close"
  },

  initialize: function() {

    _.bindAll(this, "_close", "_onKeyUp");

    this._observedField = this.options.observe;

    this.template = this.options.template_name ? this.getTemplate(this.options.template_name) : this.getTemplate('table/menu_modules/legends/views/edit_in_place');

    this._setupConfig();

    this.add_related_model(this.model);
    this.model.bind("change:" + this._observedField, this._updateValue, this);

    this.render();

  },

  _setupConfig: function() {

    this.config = new cdb.core.Model({
      mode: "view"
    });

    this.add_related_model(this.config);
    this.config.bind("change:mode", this._updateMode, this);

  },

  _updateMode: function(mode) {

    if (this.config.get("mode") == 'edit') {

      this.$el.find(".value").hide();

      this.$input.show();
      this.$input.focus();

    } else {

      this.$el.find(".value").show();
      this.$input.hide();

      var value = this.model.get(this._observedField);

      this.$input.val(value);
      this.$el.find(".value span").html(value);

    }
  },

  _updateValue: function() {

    var value = this.model.get(this._observedField);

    if (!cdb.Utils.isBlank(value)) {

      this.$input.text("");
      this.$el.find(".value").addClass("empty");
      this.$el.find(".value span").text("empty");
      this.trigger("change", null, this);

      return;
    }

    this.$input.text(value);
    this.$el.find(".value span").html(value);

    this.trigger("change", value, this);

  },

  _close: function(e) {

    e && e.preventDefault();
    e && e.stopPropagation();

    this.config.set("mode", "view");

    this._preventEmptyValue();
  },

  _preventEmptyValue: function() {

    var value = this.model.get(this._observedField);

    if (cdb.Utils.isBlank(value)) {
      this.$el.find(".value").addClass("empty");
      this.$el.find(".value span").text("empty");
    }

  },

  _onKeyUp: function(e) {

    if (e.keyCode == 13) { // Enter

      this.model.set(this._observedField, this.$el.find("input").val());
      this._close();

    } else if (e.keyCode == 27) { // Esc
      this._close();
    }

  },

  _onClick: function(e) {

    e && e.preventDefault();
    e && e.stopPropagation();

    this.config.set("mode", "edit");
  },

  render: function() {

    var value = this.model.get(this._observedField);

    if (cdb.Utils.isBlank(value)) {
      value = "null";
      this.$el.append('<input type="text" value="" />');
    } else {
      this.$el.append('<input type="text" value="' + value + '" />');
    }

    this.$el.append(this.template({ value: value }));
    this.$el.addClass("edit_in_place");

    this.$input = this.$el.find("input");

  }

});
