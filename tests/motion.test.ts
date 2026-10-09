import { test } from "node:test";
import assert from "node:assert/strict";
import { observeVisibleMotion } from "../src/lib/visibleMotion";

function environment() {
  const observers: FakeObserver[] = [];
  const visibility = new Set<() => void>();
  const mediaListeners = new Set<() => void>();
  const media = {matches:false, addEventListener:(_type:string, fn:()=>void) => mediaListeners.add(fn), removeEventListener:(_type:string, fn:()=>void) => mediaListeners.delete(fn)};
  const doc = {hidden:false, addEventListener:(_type:string, fn:()=>void) => visibility.add(fn), removeEventListener:(_type:string, fn:()=>void) => visibility.delete(fn)};
  class FakeObserver {
    observed = new Set<HTMLElement>();
    disconnected = false;
    constructor(private callback: IntersectionObserverCallback) { observers.push(this); }
    observe(el:HTMLElement) { this.observed.add(el); }
    unobserve(el:HTMLElement) { this.observed.delete(el); }
    disconnect() { this.disconnected = true; this.observed.clear(); }
    intersect(el:HTMLElement, visible:boolean, ratio = visible ? 1 : 0) {
      this.callback([{target:el,isIntersecting:visible,intersectionRatio:ratio} as unknown as IntersectionObserverEntry], this as unknown as IntersectionObserver);
    }
  }
  const replacements = {document:doc, window:{IntersectionObserver:FakeObserver,matchMedia:()=>media}, IntersectionObserver:FakeObserver};
  const saved = Object.keys(replacements).map(key => [key, Object.getOwnPropertyDescriptor(globalThis,key)] as const);
  for (const [key,value] of Object.entries(replacements)) Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
  return {observers,doc,media,visibility,mediaListeners,
    restore:() => { for (const [key,descriptor] of saved) { if(descriptor) Object.defineProperty(globalThis,key,descriptor); else Reflect.deleteProperty(globalThis,key); } },
    node:() => ({dataset:{}} as HTMLElement),
  };
}

test("Mythic motion starts paused, runs in view, and pauses offscreen", () => {
  const env = environment(), node = env.node();
  const release = observeVisibleMotion(node);
  try {
    assert.equal(node.dataset.motionActive, "false");
    env.observers[0].intersect(node,true); assert.equal(node.dataset.motionActive,"true");
    env.observers[0].intersect(node,false); assert.equal(node.dataset.motionActive,"false");
    env.observers[0].intersect(node,true); assert.equal(node.dataset.motionActive,"true");
  } finally { release(); env.restore(); }
});
test("partially visible Mythic artwork remains static until nearly completely in view", () => {
  const env = environment(), node = env.node();
  const release = observeVisibleMotion(node);
  try {
    env.observers[0].intersect(node,true,.5); assert.equal(node.dataset.motionActive,"false");
    env.observers[0].intersect(node,true,.99); assert.equal(node.dataset.motionActive,"true");
    env.observers[0].intersect(node,true,.25); assert.equal(node.dataset.motionActive,"false");
  } finally { release(); env.restore(); }
});
test("hidden tabs pause Mythic motion and resume only still-visible artwork", () => {
  const env = environment(), node = env.node();
  const release = observeVisibleMotion(node);
  try {
    env.observers[0].intersect(node,true);
    env.doc.hidden = true; env.visibility.forEach(fn=>fn()); assert.equal(node.dataset.motionActive,"false");
    env.doc.hidden = false; env.visibility.forEach(fn=>fn()); assert.equal(node.dataset.motionActive,"true");
    env.observers[0].intersect(node,false);
    env.doc.hidden = true; env.visibility.forEach(fn=>fn());
    env.doc.hidden = false; env.visibility.forEach(fn=>fn()); assert.equal(node.dataset.motionActive,"false");
  } finally { release(); env.restore(); }
});
test("reduced-motion preference stops Mythic animation even when visible", () => {
  const env = environment(), node = env.node();
  env.media.matches = true;
  const release = observeVisibleMotion(node);
  try {
    env.observers[0].intersect(node,true); assert.equal(node.dataset.motionActive,"false");
    env.media.matches = false; env.mediaListeners.forEach(fn=>fn()); assert.equal(node.dataset.motionActive,"true");
    env.media.matches = true; env.mediaListeners.forEach(fn=>fn()); assert.equal(node.dataset.motionActive,"false");
  } finally { release(); env.restore(); }
});
test("many artworks share resources and the last unmount cleans up all listeners", () => {
  const env = environment(), one = env.node(), two = env.node();
  const releaseOne = observeVisibleMotion(one), releaseTwo = observeVisibleMotion(two);
  try {
    assert.equal(env.observers.length,1); assert.equal(env.visibility.size,1); assert.equal(env.mediaListeners.size,1);
    env.observers[0].intersect(one,true); env.observers[0].intersect(two,true);
    releaseOne(); assert.equal(env.observers[0].disconnected,false); assert.equal(env.observers[0].observed.size,1);
    // A queued intersection callback cannot re-activate an unmounted artwork.
    env.observers[0].intersect(one,true); assert.equal(one.dataset.motionActive,"false");
    releaseTwo(); assert.equal(env.observers[0].disconnected,true); assert.equal(env.visibility.size,0); assert.equal(env.mediaListeners.size,0);
  } finally { releaseOne(); releaseTwo(); env.restore(); }
});
test("unsupported IntersectionObserver safely leaves static Mythic artwork", () => {
  const env = environment(), node = env.node();
  try {
    Reflect.deleteProperty(window,"IntersectionObserver");
    const release = observeVisibleMotion(node); assert.equal(node.dataset.motionActive,"false");
    assert.equal(env.observers.length,0); assert.equal(env.visibility.size,0); release();
  } finally { env.restore(); }
});
