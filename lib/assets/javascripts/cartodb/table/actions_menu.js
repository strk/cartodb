
  /**
   *  Actions menu view, aka LayersPanel
   *
   *  - It needs at least visualization and user models.
   *    Globalerror to show connection or fetching errors.
   *
   *    var menu = new cdb.admin.LayersPanel({
   *      vis: vis_model,
   *      user: user_model,
   *      globalError: globalError_obj
   *    });
   */

  cdb.admin.LayersPanel = cdb.ui.common.TabPane.extend({

    className: 'table_panel',
    animation_time: 300,

    _MAX_LAYERS: 3,
    _MIN_LAYERS: 1,

    _TEXTS: {
      visualization: {
        msg:    _t('If you want to add multiple layers you need to create a visualization.'),
        error:  _t('Error adding that table into the new visualization')
      },
      remove: {
        title:  _t('Delete this layer'),
        desc:   _t('You are about to delete this layer. Doing so won\'t remove your table, \
                only this visualization will be affected.'),
        ok:     _t('Delete layer')
      },
      cant_remove: {
        title:  _t('Delete this layer'),
        desc:   _t('You can\'t remove all layers from the visualization, it needs at least one to make it work.'),
        ok:     _t('Close')
      },
      error: {
        default: _t('Something went wrong, try again later')
      }
    },

    events: {
      'click .add_layer': '_addLayerDialog'
    },

    initialize: function() {
      this.layer_panels = []; // Layer panels added in the current visualization
      this.vis = this.options.vis;
      this.map = this.vis.map;
      this.globalError = this.options.globalError;

      // Set max layers if user has this parameter
      var max_user_layers = this.options.user.get('max_layers');
      if (!isNaN(max_user_layers) && this._MAX_LAYERS != max_user_layers) {
        this._MAX_LAYERS = max_user_layers;
      }

      // View bindings
      _.bindAll(this, '_sortLayers', '_manageLayers', '_checkResize');
      this.map.layers.bind('add',    this._newLayer, this);
      this.map.layers.bind('reset',  this._resetLayers, this);
      this.map.layers.bind('add remove', this._updateLayerPositionLabel, this);
      $(window).bind('resize', this._checkResize);
      this.add_related_model(this.map);
      this._bindSort(); // Bind sort movement

      this._addLayers(this.map.layers);

      // Setting several pane parameters
      this.isOpen = true;
      this.activeWorkView = 'table';

      cdb.ui.common.TabPane.prototype.initialize.call(this);
    },


    /* Layer panel functions */

    _resetLayers: function() {
      //clean all views
      this.removeTabs();
      // Empty layers array
      this.layer_panels = [];
      // Add again the layers
      this._addLayers(this.map.layers);
    },

    _addLayers: function(layers) {

      // Add 'add layer' button first
      this._addLayerAddButton();

      // Add layers
      var self = this;
      layers.each(function(l, pos) {
        self._addLayer(l, pos);
      });

      // Set default layer
      this._setDefaultLayer();

    },

    _newLayer: function(layer) {
      this._addLayer(layer);
    },

    _addLayer: function(layer, pos) {
      var self = this;
      if (layer.get('type') == 'CartoDB') {

        var v = new cdb.admin.LayerPanelView({
          model: layer,
          vis: self.vis,
          user: self.options.user,
          globalError: self.options.globalError
        });

        v.bind('toggle',    self._toggle, self);
        v.bind('switchTo',  self._switchTo, self);
        v.bind('delete',    self._remove, self);

        self.addTab(layer.cid, v, { after: 0 });
        v.setActiveWorkView(self.activeWorkView);
        self.layer_panels.push(v);
        self._bindLayerTooltip(v);

        // no pos -> new layer -> set as current
        if (!pos) {
          self._switchTo(v, true);
        }

        self._checkLayers();
      }
    },

    _removeLayer: function(cid) {
      var layer_view = this.getPane(cid);
      var self = this;

      this.layer_panels = _.filter(this.layer_panels, function(view) {
        if (view != layer_view) return view;
      });

      var tabBind = function(cid) {
        var view = self.getPane(cid);
        self.trigger('switch', view);
        self.vis.save('active_layer_id', view.dataLayer.id);
        self.show(view.panels.activeTab);
        self.unbind('tabEnabled', tabBind);
      }

      this.bind('tabEnabled', tabBind);

      this._unbindLayerTooltip(layer_view);
      this.removeTab(cid);
      this._checkLayers();
      this._manageLayers();
    },

    _setDefaultLayer: function() {
      var layer_id = this.vis.get('active_layer_id');
      var layer = _.last(this.layer_panels);

      // Get layer from layer_id
      if (layer_id) {
        for (var i in this.layer_panels) {
          var lyr = this.layer_panels[i];
          if (lyr.dataLayer.id == layer_id) {
            layer = lyr;
            break;
          }
        }
      }

      // Any layer? Switch to it
      if (layer) {
        this._switchTo(layer, false);
      }
    },


    // Check how many layers-view there are in the panel
    _checkLayers: function() {
      var cartodb_layers = this.map.layers.getLayersByType('CartoDB').length;
      if (cartodb_layers >= this._MAX_LAYERS) {
        this._hideLayerButton();
      } else {
        this._showLayerButton();
      }

      if (cartodb_layers == 1) {
        this._unbindSort();
      } else {
        this._bindSort();
      }
    },


    /* Add layer functions */

    _addLayerAddButton: function() {
      this.$('.add_layer').remove();
      var template = this.getTemplate('table/views/add_layer');
      this.$el.prepend(template());
    },

    _showLayerButton: function() {
      this.$('section.add_layer').show();
    },

    _hideLayerButton: function() {
      this.$('section.add_layer').hide();
    },

    _addLayerDialog: function(e) {
      this.killEvent(e);
      var self = this;
      var user_quota = this.options.user.get("remaining_byte_quota") * this.options.user.get("actions").import_quota;

      this.new_layer_dlg && this.new_layer_dlg.clean();


      this.new_layer_dlg = new cdb.admin.NewLayerDialog({
        tables: new cdb.admin.Visualizations(),
        vis: self.vis,
        quota: user_quota,
        ok: function(tableName, private_vis) {

          var userName = self.options.user.get('name');

          if(!self.vis.isVisualization()) {
            self.create_vis_dialog && self.create_vis_dialog.clean();
            self.create_vis_dialog = new cdb.admin.CreateVizDialog({
              model: self.vis,
              msg: self._TEXTS.visualization.msg
            });

            self.create_vis_dialog.ok = function(vis) {
              self.map.addCartodbLayerFromTable(tableName, userName, {
                success: function() {
                  // Get scenario param (table or map)
                  var last_route = window.table_router.history.length > 0 && _.last(window.table_router.history).split('/');
                  // Create url
                  // TODO: use viewUrl from this.vis
                  var url = "/viz/" + self.vis.get("id") + "/" + ( last_route[2] || 'table' );
                  // Navigate
                  window.table_router.navigate(url, { trigger: false });
                  window.table_router.addToHistory();
                },
                error: function() {
                  self.create_vis_dialog.onCreationError(null, self._TEXTS.visualization.error)
                }
              });
            }

            self.create_vis_dialog.appendToBody().open();
          } else {
            // Add new layer
            self.map.addCartodbLayerFromTable(tableName, userName, {
              success: function() {
                // It needs a privacy change?
                if (private_vis) {
                  self.vis.save('privacy', 'PRIVATE');
                }
              }
            });
          }
        }
      });

      this.new_layer_dlg.appendToBody().open();
    },

    _bindLayerTooltip: function(v) {
      var self = this;
      this._unbindLayerTooltip(v);
      v && v.$('a.info').tipsy({
        live: true,
        gravity: 'e',
        offset: 0,
        fade: true,
        title: function() {
          if (!self.vis.isVisualization() || self.isOpen) {
            return '';
          }
          return $(this).find('span.name').text();
        }
      });
    },

    _unbindLayerTooltip: function(v) {
      v && v.$("a.info").unbind('mouseenter mouseleave');
      if (v && v.$("a.info").data('tipsy')) v.$("a.info").data('tipsy').remove();
    },

    _hideLayerTooltip: function(v) {
      v && v.$("a.info").tipsy("hide")
    },

    _bindSort: function() {
      this._unbindSort();

      this.$el.sortable({
        axis:                 "y",
        items:                "> .layer_panel",
        handle:               ".layer_info a.info",
        contaiment:           "parent",
        opacity:              0.5,
        start:                this._startSort,
        update:               this._sortLayers,
        forcePlaceholderSize: false
      });
    },

    _startSort: function(ev, ui) {
      // Set same height for placeholder
      var active_height = $(ui.item).outerHeight();
      $(ui.placeholder).outerHeight(active_height);
    },

    _unbindSort: function() {
      this.$el.sortable('destroy')
    },

    _updateLayerPositionLabel: function() {
      _.each(this.layer_panels, function(layer) {
        layer.setLayerOrder(layer.model);
      });
    },

    _sortLayers: function() {
      var self = this;
      // set the new order in layer collection from layer view
      // positions
      var order = 1;

      var layer_count = self.map.layers.size()
      this.$el.children().each(function(index, element) {
        var id = element.getAttribute('model-id');
        if(id) {
          var dataLayer = self.map.layers.get(id);
          if(dataLayer) {
            // use silent, save after all are sorted, see below
            dataLayer.set({ 'order': layer_count - order }, { silent: true });
            order++;
          }
        }
      })

      // layers don't need to be reset when they are sorted
      // and save the new layers order to the server
      var count = _.after(this.map.layers.size(), function() {
        self._updateLayerPositionLabel();
        self.map.layers.bind('reset',  self._resetLayers, self);
      });

      this.map.layers.unbind('reset', this._resetLayers, this);
      this.map.layers.saveLayers({ success: count, error: count });
    },

    /* Magic layers */
    _manageLayers: function() {
      var cartodb_layers = this.map.layers.getLayersByType('CartoDB').length;
      // If there isn't any layer added
      if (cartodb_layers == 0) return false;

      var $active_layer = this.activePane.$el;

      // Move rest of panels
      this.$('.layer_panel').removeClass('active');

      // Add active class
      $active_layer.addClass('active');

      // Set rest of layer_panels to height 60px
      // Decide later about compress them
      // TODO: not use jquery
      this.$('.layer_panel').not('.layer_panel.active').css({ height: 66 });

      // Get previous siblings and calculate space
      // TODO: not use jquery
      var pre_size = $active_layer.prevAll('.layer_panel').size();
      var t_s = (pre_size == 0) ? 0 : (pre_size * 43);

      // Get next siblings and calculate space
      // TODO: not use jquery
      var next_size = $active_layer.nextAll('.layer_panel').size();
      var b_s = (next_size == 0) ? 0 : (next_size * 43);

      // Set layers offset
      var offset = -15;

      // If max layers is equal to cartodb layers add
      // the 'add_layer' button space, due to it is hidden now.
      if (this._MAX_LAYERS == cartodb_layers) offset = offset + 43;
      $active_layer.css({ height: this.$el.height() - (t_s + b_s) + offset })
    },

    /* testing resize event */
    _checkResize: function(e) {
      if (this.resize) clearTimeout(this.resize);
      var self = this;
      this.resize = setTimeout(self._manageLayers, 100);
    },

    show: function(modName) {
      var width  = 600,
          action = 'show';

      // Select the tab
      var mod = this.getActivePane();
      mod.tabs.activate(modName);
      mod.panels.active(modName);

      switch (modName) {
        case 'filters_mod':
        case 'legends_mod':
        case 'wizards_mod':
        case 'infowindow_mod':
          width  = 450;
          action = 'narrow';
          break;
        default:
      }

      // Show panel -> trigger
      cdb.god.trigger('panel_action', action);

      this.isOpen = true;
      this.$el.animate({
          width: width,
          right: 0
      }, this.animation_time, function() {
        cdb.god.trigger("end_" + action);
      });
    },

    hide: function(modName) {
      var panel_width = this.$el.width();

      // Hide the tab
      var mod = this.getActivePane();
      //mod.tabs.deactivate(modName);

      // Hide panel -> trigger
      cdb.god.trigger("panel_action", "hide");

      this.isOpen = false;
      this.$el.animate({
        right: 63 - panel_width
      }, this.animation_time);
    },

    // l    -> layer view
    // open -> flag to know if it is necessary to open the panel
    _switchTo: function(l, open) {
      // Check if switched layer is active one
      if (this.activePane == l) {

        if (open !== undefined) {
          if (open === true) {
            this.show(l.panels.activeTab);
          } else {
            this.hide();
          }
        } else {
          if (this.isOpen) {
            this.hide();
          } else {
            this.show(l.panels.activeTab);
          }
        }
      }

        // if not, activate it
      if (this.activePane != l) {
        this._hideLayerTooltip(l);
        this.active(l.dataLayer.cid);
        if (l.dataLayer.id && this.vis.get('active_layer_id') != l.dataLayer.id) {
          this.vis.save('active_layer_id', l.dataLayer.id);
        }
        if (open === undefined) this.show(l.panels.activeTab);
      }

      // Send trigger
      this.trigger('switch', l);

      // Manage available layers
      this._manageLayers();
    },

    _toggle: function(modName) {
      // only hide if we click on active tab
      if (this.isOpen && modName == this.getActivePane().panels.activeTab) {
        this.hide(modName);
      } else {
        this.show(modName);
      }
    },

    // We need to review this method, it is not easy to
    // make operations when the view is cleaning/removing
    // For now the model destroy is happening here
    _remove: function(layer_view) {
      var cid = layer_view.dataLayer.cid;
      var self = this;
      var permitted = true;

      // Check if there is at least 1 layer
      // if not, don't let user do it
      if (this.map.layers.getLayersByType('CartoDB').length <= this._MIN_LAYERS) {
        permitted = false;
      }

      this.remove_dlg && this.remove_dlg.clean();
      this.remove_dlg = new cdb.admin.BaseDialog({
        title: self._TEXTS[permitted ? 'remove' : 'cant_remove'].title,
        description: self._TEXTS[permitted ? 'remove' : 'cant_remove'].desc,
        template_name: 'common/views/confirm_dialog',
        clean_on_hide: true,
        enter_to_confirm: true,
        ok_button_classes: "right button grey",
        ok_title: self._TEXTS[permitted ? 'remove' : 'cant_remove'].ok,
        cancel_button_classes: "underline margin15 " + (permitted ? '' : 'hide'),
        modal_type: "confirmation",
        width: 500
      });

      if (permitted) {
        // If user confirms, app removes this panel view,
        // including the map layer
        this.remove_dlg.ok = function() {
          // Destroy layer model
          layer_view.model.destroy({
            success: function() {
              self._removeLayer(cid)
            },
            error: function(){
              self.globalError.showError(that._TEXTS.error.default, 'error', 3000);
            },
            wait: true
          });
        }
      }

      // Show it up
      this.remove_dlg
        .appendToBody()
        .open();
    },

    setActiveWorkView: function(workView) {
      this.hide();
      this.activeWorkView = workView;

      // Set active work view for all panes,
      // not only for the current one
      this.each(function(tab, pane){
        pane.setActiveWorkView(workView);
      })
    },

    clean: function() {
      $(window).unbind('resize', this._checkResize);
      if (this.resize) clearTimeout(this.resize);
      this._unbindSort();
      cdb.ui.common.TabPane.prototype.clean.call(this);
    }
  });
