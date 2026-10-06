// Chrome's built-in Google Translate (and similar extensions) rewrites the
// page by moving every text node into its own <font> wrappers. React still
// holds references to the original nodes, so the next big DOM change —
// e.g. the Jubah form swapping to the booking confirmation — calls
// insertBefore/removeChild on a node that is no longer a child of its
// parent, and the whole app crashes ("NotFoundError: Failed to execute
// 'insertBefore' on 'Node'"). Reported live: a customer with the page
// translated hit the error screen right after a successful booking
// (JUB-26-UMPSA-QFCY8J), so she believed it had failed. Reproduced locally by
// simulating Translate's DOM rewrite before tapping Book.
//
// Instead of blocking translation (Malay-speaking customers rely on it),
// make these two DOM calls tolerant of a moved node, the long-standing
// workaround from the React issue tracker (facebook/react#11538):
// - removeChild of a node that's already gone → no-op
// - insertBefore with a reference node that moved → append instead, so the
//   new content still appears rather than being lost.

export function installTranslateGuard() {
  if (typeof Node !== 'function' || !Node.prototype) return;

  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) {
      console.warn('[GERAK] removeChild skipped: node was moved (page translation?)');
      return child;
    }
    return originalRemoveChild.call(this, child) as T;
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(this: Node, newNode: T, referenceNode: Node | null): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      console.warn('[GERAK] insertBefore reference node was moved (page translation?) — appending instead');
      return originalInsertBefore.call(this, newNode, null) as T;
    }
    return originalInsertBefore.call(this, newNode, referenceNode) as T;
  };
}
