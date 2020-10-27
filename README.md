# cdnler
**CDN** down**L**oad**ER**

Cdnler looks at html files for links to javascript assets hosted externally. It then optionally downloads those assets. It then optionally outputs html with local references.

___
## Archive 

This repo and NPM package is now *archived* and will no longer be supported.

### Rationale

The practice that this package was designed to support, that of adding an external resource to an HTML file (e.g. via `<script src="https://cdn.org/jquery-latest.js"></script>`) is now considered outdated. Using an external resource creates dependency on 3rd party servers which multiplies the potential of a web application being inaccessible. Potential security vulnerability of using external resources is slim but not completely trivial, either. Modern JavaScript encourages modularity, tree-shaking and bundling, which result in smaller, faster load times. For these and similar reasons, CDNLER itself is outdated.

Arguments still in favor of adding external resources to an HTML file:

1. *Fast prototyping : a developer can create an entire website with a single HTML file and judicious use of `<script>` tags.* I don't really have an argument against this. I think it's pretty neat, and I have fond memories of doing this. If you still find this useful, great! Feel free to fork CDNler!
1. *Browser caching : whenever user visits a site that downloads a package via CDN, that package is cached in the browser and loads faster for the next website that uses that resource*. Personally, I always found this argument a bit unconvincing, because there is no canonical source for any given resource, never mind all of the various versions of each resource. There are a great many CDNs: *googleapis*, *cdnjs*, *unpkg*, et. al. that all host the same resources (e.g. `jquery-latest`, `query-3.5.1.slim.min.js`, `jquery-migrate-3.3.1.js` etc).  But, even if we grant it, the days of cross-site browser-caching [is *over*](https://developers.google.com/web/updates/2020/10/http-cache-partitioning) with the now-widespread practice of *browser cache partitioning*, which is to say, that each website will have its own isolated cache. Loading the same package from website A will take just as long from website B

Given that the arguments against far outweigh the benefits, CDNLER is archived.

### Recommendation

My recommendation, if you have not already, is to shift your practice from loading resources externally and to use the currently widespread practice of downloading libraries, bundling them with [tree-shaking](https://en.wikipedia.org/wiki/Tree_shaking), and including bundled scripts. [`webpack`](https://webpack.js.org/) is the currently most popular bundler (and the one I happen to use the most), but some find its configuration to be unnecessarily convoluted, and I think that's a fair point. Other bundlers include [`rollup.js`](https://rollupjs.org/guide/en/) (which I found to be easy to configure but has fewer features), [`Parcel`](https://parceljs.org/) (I used it once about 5 years ago) and [Snowpack](https://www.snowpack.dev/) (I have zero experience with this one, only having ever heard it mentioned)

___
## Install

npm install --save-dev cdnler

and/or if you'd like to use the CLI

npm install --global cdnler
