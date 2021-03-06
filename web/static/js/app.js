if ('serviceWorker' in navigator) {

  navigator.serviceWorker
  .register('./service-worker.js', { scope: './' })
  .then(function(registration) {
    console.log("Service Worker Registered");
  })
  .catch(function(err){
    console.log("Service Worker Failed to Register", err);
  })
}

// Sorts the keys by the distances to the corresponding entities from the userCoords.
var sortByDistance = function(keys, entities, userCoords) {
  keys.sort(function(a, b) {
    var entityA = entities[a];
    var entityB = entities[b];
    var locCurrent = new LatLon(userCoords.latitude, userCoords.longitude);
    var locA = new LatLon(entityA.latitude, entityA.longitude);
    var locB = new LatLon(entityB.latitude, entityB.longitude);
    var distA = locA.distanceTo(locCurrent);
    var distB = locB.distanceTo(locCurrent);
    return distA - distB;
  });
};


// Wrapper around fetching of the JSON data to avoid fetching twice in a session
var TrailData = {
  _trails: null,
  _communities: null,
  _comtrails: null,

  getTrails: function() {
    if (this._trails == null) {
      return $.getJSON('static/data/trails.json').then(function(trails) {
        this._trails = trails;
        return trails;
      }.bind(this))
    } else {
      return $.Deferred().resolve(this._trails).promise();
    }
  },

  getTrail: function(id) {
    return this.getTrails().then(function(trails) {
      return trails[id];
    });
  },

  getCommunities: function() {
    if (this._communities == null) {
      return $.getJSON('static/data/communities.json').then(function(communities) {
        this._communities = communities;
        return communities;
      }.bind(this))
    } else {
      return $.Deferred().resolve(this._communities).promise();
    }
  },

  getCommunity: function(id) {
    return this.getCommunities().then(function(communities) {
      return communities[id];
    });
  },

  getComTrails: function() {
    if (this._comtrails == null) {
      return $.getJSON('static/data/comtrail.json').then(function(comtrails) {
        this._comtrails = comtrails;
        return comtrails;
      }.bind(this))
    } else {
      return $.Deferred().resolve(this._comtrails).promise();
    }
  },

  getComTrail: function(id) {
    return this.getComTrails().then(function(comtrails) {
      return comtrails[id];
    });
  },


  /**
   * Wrapper around watching the geolocation with additional caching in localStorage.
   */
  watchPosition: function(success) {
    // Calls back immediately if there is a cached location available,
    // and calls back a second time when an updated location is computed.
    if ("geolocation" in navigator) {
      /* geolocation is available */

      // Pull last coordinates from local cache first if available
      var lastCoords = window.localStorage.getItem('lastCoords');
      if (lastCoords != null) {
        lastCoords = JSON.parse(lastCoords);
        console.log('Using cached coordinates: ' + lastCoords.latitude + ', ' + lastCoords.longitude);
        success(lastCoords);
      }

      // Configure callback for geolocation
      return navigator.geolocation.watchPosition(function(position) {
        var coords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        window.localStorage.setItem('lastCoords', JSON.stringify(coords));
        console.log('Received new coordinates: ' + coords.latitude + ', ' + coords.longitude);
        success(coords);
      }, function(err) {
        console.warn('ERROR(' + err.code + '): ' + err.message);
      });
    } else {
      console.warn('Geolocation API not available in this browser.');
    }
  },
};


// Define a new component called <trail-listing>
var trailList = Vue.component('trail-list', {
  // Use the template defined with the id="trail-list-tpl"
  template: '#trail-list-tpl',

  data: function() {
    return {
      trails: null,
      sortKeys: null,
      watcherId: null,
      searchQuery: null,
      community: null,
    }
  },

  computed: {
    filteredKeys: function() {
      if (this.sortKeys == null) {
        return [];
      }
      if (!this.searchQuery && !this.$route.query.community) {
        return this.sortKeys;
      }
      // TODO: search by community
      return _.filter(this.sortKeys, function(key) {
        var trail = this.trails[key];
        if (this.$route.query.community && this.$route.query.community != trail.community) {
          return false;
        }
        if (!this.searchQuery) {
          return true;
        }
        return fuzzysearch(this.searchQuery.toLowerCase(), trail.name.toLowerCase());
      }, this);
    },
  },

  watch: {
    // call again the method if the route changes
    '$route': function(to, from) {
      this.fetchCommunity(to);
    }
  },

  // This gets executed when this component is created
  created: function() {
    // Load the data from our static JSON files
    TrailData.getTrails().then(function(trails) {
      this.trails = trails;
      this.sortKeys = Object.keys(this.trails);
    }.bind(this)).then(function() {
      this.watcherId = TrailData.watchPosition(this.sortTrails);
    }.bind(this));

    this.fetchCommunity(this.$route);
  },

  beforeDestroy: function() {
    // Stop watching the geolocation (unregister the sortTrails callback)
    // when this component is destroyed
    if (this.watcherId != null) {
      navigator.geolocation.clearWatch(this.watcherId);
    }
  },

  methods: {
    sortTrails: function(coords) {
      sortByDistance(this.sortKeys, this.trails, coords);
    },
    fetchCommunity: function(toRoute) {
      this.community = null;
      console.log(toRoute);
      if (toRoute.query.community) {
        TrailData.getCommunity(toRoute.query.community).then(function(community) {
          this.community = community;
        }.bind(this));
      }
    }
  }
})

Vue.component('trail-listing', {
  props: ['trail', 'trailId'],

  // Use the template defined with the id="trail-listing-tpl"
  template: '#trail-listing-tpl',
})

Vue.component('dog-icon', {
  props: ['allowed'],

  // Use the template defined with the id="trail-listing-tpl"
  template: '#dog-icon-tpl',
})

var trailDetails = Vue.component('trail-details', {
  // id gets passed in as a prop from the router
  props: ['id'],

  // Use the template defined with the id="trail-details-tpl"
  template: '#trail-details-tpl',

  data: function() {
    return {
      trail: null,
      loading: false,
    }
  },

  // This gets executed when this view-model is created
  created: function() {
    this.fetchData();
  },

  watch: {
    // call again the method if the route changes
    '$route': 'fetchData'
  },

  methods: {
    fetchData: function() {
      this.loading = true;
      // Load the data from our static JSON files
      TrailData.getTrail(this.id).then(function(trail) {
        this.trail = trail;
        this.loading = false;
      }.bind(this));
    },
  },
})



// Duplicate Trails functionality for communities
// Define a new component called <community-listing>
var communityList = Vue.component('community-list', {
  // Use the template defined with the id="community-list-tpl"
  template: '#community-list-tpl',

  data: function() {
    return {
      communities: null,
      sortKeys: null,
      watcherId: null,
    }
  },

  // This gets executed when this view-model is created
  created: function() {
    // Load the data from our static JSON files
    TrailData.getCommunities().then(function(data) {
      this.communities = data;
      this.sortKeys = Object.keys(this.communities);
    }.bind(this)).then(function() {
      this.watcherId = TrailData.watchPosition(this.sortCommunities);
    }.bind(this));
  },

  beforeDestroy: function() {
    if (this.watcherId != null) {
      navigator.geolocation.clearWatch(this.watcherId);
    }
  },

  methods: {
    sortCommunities: function(coords) {
      sortByDistance(this.sortKeys, this.communities, coords);
    }
  }
})

Vue.component('community-listing', {
  // Takes one object named "community" as a property
  props: ['community', 'communityId'],

  // Use the template defined with the id="community-list-tpl"
  template: '#community-listing-tpl',
})

var communityDetails = Vue.component('community-details', {
  // id gets passed in as a prop from the router
  props: ['id'],

  // Use the template defined with the id="community-details-tpl"
  template: '#community-details-tpl',

  data: function() {
    return {
      community: null,
      loading: false,
    }
  },

  watch: {
    // call again the method if the route changes
    '$route': 'fetchData'
  },

  created: function() {
    this.fetchData();
  },

  // This gets executed when this view-model is created
  methods: {
    fetchData: function() {
      this.loading = true;
      // Load the data from our static JSON files
      TrailData.getCommunity(this.id).then(function(data) {
        this.community = data;
        this.loading = false;
      }.bind(this));
    },
  },
})
//Communities json


// Define the routes
var router = new VueRouter({
  routes: [
    { path: '/trails', component: trailList, meta: {title: "Trails"}},
    { path: '/trails/:id', component: trailDetails, props: true, meta: {title: "Trail Details"}},
    { path: '/communities', component: communityList, meta: {title: "Communities"}},
    { path: '/communities/:id', component: communityDetails, props:true, meta: {title: "Community Details"}},
    { path: '/', redirect: '/trails' },
  ]
})

// Update the title on each navigation event based on the meta.title fields defined above.
router.afterEach(function(to, from) {
  bus.$emit('new-title', to.meta.title);
});

// An empty Vue instance to serve as a central event bus
// https://vuejs.org/v2/guide/components.html#Non-Parent-Child-Communication
var bus = new Vue();

// vm stands for "view-model"
vm = new Vue({
  // Bind this view-model to the element with id="app"
  el: '#app',

  data: {
    transitionName: '',
  },

  watch: {
    '$route': function(to, from) {
      var toDepth = to.path.split('/').length
      var fromDepth = from.path.split('/').length
      if (toDepth < fromDepth) {
        this.transitionName = 'slide-right';
      } else if (toDepth > fromDepth) {
        this.transitionName = 'slide-left';
      } else {
        this.transitionName = '';
      }
      console.log(this.transitionName);
    }
  },

  // "Inject" the router we defined above into the application
  router: router,
})

// Create another view-model for the header, since the header
// has to be the first thing in the body and cannot be wrapped
// in the same div as the app content div
new Vue({
  // Bind it to the header
  el: '#header',

  data: {
    title: 'Trails Across New Mexico', // this should never be displayed
  },

  // "Inject" the same router
  router: router,

  created: function() {
    bus.$on('new-title', function(title) {
      this.title = title;
    }.bind(this));

    // Set initial title
    bus.$emit('new-title', this.$route.meta.title);
  },
})

new Vue({
  el: '#tab-bar',
  router: router,
})
