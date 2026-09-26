# Map touch and mobile layout

- `01-map-390px.png`: mobile WebKit map with one-finger Leaflet dragging enabled; bottom navigation at the viewport edge.
- `02-scrolled-320px.png`: the same map at a narrow viewport with the document scrolled to the end; the bottom summary remains above the navigation.

These are browser screenshots from a local test login and test point. The map drag check used synthetic touch events; the document was scrolled programmatically because mobile WebKit automation does not expose a wheel gesture. Browser safe-area insets were zero, so these screenshots do not verify the Home Screen app's physical home-indicator inset. The local server had no Sheets connection, so its header displayed an error state.
