// returns a memoizing Levenshtein distance function
function levenshtein() {
  var memo = {};
  
  // compute the distance between strings
  return function distance(a, b) {
    var len_a = a.length
    var len_b = b.length
    if (len_a == 0) { return len_b; }
    if (len_b == 0) { return len_a; }
    
    var key = a < b ? a + '\0' + b : b + '\0' + a;
    if (memo.hasOwnProperty(key)) { return memo[key]; }
    
    var a__ = a.substring(0, len_a-1);
    var b__ = b.substring(0, len_b-1);
    var ret = Math.min(distance(a__, b) + 1,
                       distance(a, b__) + 1,
                       distance(a__, b__) + (a[len_a-1] == b[len_b-1] ? 0 : 1));
    memo[key] = ret;
    return ret;
  }
}

// returns a hierarchical clustering function
//   toText: optional function to extract text from items
// modified from package "science"
function cluster(toText) {
  var toText = toText || function(x) { return x; }
  var distance = levenshtein();
  var linkage = "simple"; // simple, complete or average
  
  // cluster a collection of items
  return function hcluster(vectors) {
    var n = vectors.length,
        dMin = [],
        cSize = [],
        distMatrix = [],
        clusters = [],
        c1,
        c2,
        c1Cluster,
        c2Cluster,
        p,
        root,
        i,
        j;

    // Initialise distance matrix and vector of closest clusters.
    i = -1; while (++i < n) {
      dMin[i] = 0;
      distMatrix[i] = [];
      j = -1; while (++j < n) {
        distMatrix[i][j] = i === j ? Infinity : distance(toText(vectors[i]), toText(vectors[j]));
        if (distMatrix[i][dMin[i]] > distMatrix[i][j]) dMin[i] = j;
      }
    }

    // create leaves of the tree
    i = -1; while (++i < n) {
      clusters[i] = [];
      clusters[i][0] = {
        left: null,
        right: null,
        dist: 0,
        label: toText(vectors[i]),
        item: vectors[i],
        size: 1,
        depth: 0
      };
      cSize[i] = 1;
    }

    // Main loop
    for (p = 0; p < n-1; p++) {
      // find the closest pair of clusters
      c1 = 0;
      for (i = 0; i < n; i++) {
        if (distMatrix[i][dMin[i]] < distMatrix[c1][dMin[c1]]) c1 = i;
      }
      c2 = dMin[c1];

      // create node to store cluster info 
      c1Cluster = clusters[c1][0];
      c2Cluster = clusters[c2][0];

      var newCluster = {
        left: c1Cluster,
        right: c2Cluster,
        dist: distMatrix[c1][c2],
        label: c1Cluster.size > c2Cluster.size ? c1Cluster.label : c2Cluster.label,
        size: c1Cluster.size + c2Cluster.size,
        depth: 1 + Math.max(c1Cluster.depth, c2Cluster.depth)
      };
      clusters[c1].splice(0, 0, newCluster);
      cSize[c1] += cSize[c2];

      // overwrite row c1 with respect to the linkage type
      for (j = 0; j < n; j++) {
        switch (linkage) {
          case "single":
            if (distMatrix[c1][j] > distMatrix[c2][j])
              distMatrix[j][c1] = distMatrix[c1][j] = distMatrix[c2][j];
            break;
          case "complete":
            if (distMatrix[c1][j] < distMatrix[c2][j])
              distMatrix[j][c1] = distMatrix[c1][j] = distMatrix[c2][j];
            break;
          case "average":
            distMatrix[j][c1] = distMatrix[c1][j] = (cSize[c1] * distMatrix[c1][j] + cSize[c2] * distMatrix[c2][j]) / (cSize[c1] + cSize[j]);
            break;
        }
      }
      distMatrix[c1][c1] = Infinity;

      // infinity ­out old row c2 and column c2
      for (i = 0; i < n; i++)
        distMatrix[i][c2] = distMatrix[c2][i] = Infinity;

      // update dmin and replace ones that previous pointed to c2 to point to c1
      for (j = 0; j < n; j++) {
        if (dMin[j] == c2) dMin[j] = c1;
        if (distMatrix[c1][j] < distMatrix[c1][dMin[c1]]) dMin[c1] = j;
      }

      // keep track of the last added cluster
      root = newCluster;
    }

    return root;
  }
}

// extract items from a (sub)clustering
function items(hier) {
  if ( ! hier) {
    return [];
  }
  if (hier.item) {
    return [ hier.item ];
  }
  return items(hier.left).concat(items(hier.right));
}

// extract winners (large groups of similar items) from a clustering
function winners(hier, min) {
  min = min || Math.max(hier.size * .20, 3); // 20% and at least 3
  if (hier.size < min ) {
    return [];
  }
  if (hier.dist < hier.label.length * .20) { // within ~20%
    return [ { label: hier.label, size: hier.size, items: items(hier) } ];
  }
  return winners(hier.left, min).concat(winners(hier.right, min));
}

module.exports = {
  cluster: cluster,
  winners: winners
};

if (require.main === module) {
  var c = cluster(function(x) { return x.text; });
  var tree = c([
    { text: 'hello', user: 'maxg' },
    { text: 'hello', user: 'glittle' },
    { text: 'hello', user: 'rcm' },
    { text: 'hello!', user: 'kp' }
  ]);
  console.log(require('util').inspect(tree, true, null));
  console.log(require('util').inspect(winners(tree), true, null));
}
