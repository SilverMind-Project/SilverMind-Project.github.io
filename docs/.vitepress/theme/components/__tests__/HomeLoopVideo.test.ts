// @vitest-environment happy-dom
import { afterEach, describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import HomeLoopVideo from "../HomeLoopVideo.vue";

const props = { name: "pipeline", label: "A rule being built", width: 1440, height: 820 };

function stubBrowser(reducedMotion: boolean) {
  const observers: Array<(entries: Array<{ isIntersecting: boolean }>) => void> = [];
  vi.stubGlobal("matchMedia", () => ({ matches: reducedMotion }));
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
        observers.push(callback);
      }
      observe() {}
      disconnect() {}
    },
  );
  return observers;
}

describe("HomeLoopVideo", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is silent, labelled, and downloads nothing up front", () => {
    stubBrowser(false);
    const video = mount(HomeLoopVideo, { props }).find("video");
    expect(video.element.muted).toBe(true);
    expect(video.attributes("preload")).toBe("none");
    expect(video.attributes("aria-label")).toBe(props.label);
    expect(video.attributes("poster")).toBe("/videos/pipeline.webp");
  });

  it("plays on screen and pauses off screen", () => {
    const observers = stubBrowser(false);
    const element = mount(HomeLoopVideo, { props }).find("video").element;
    const play = vi.spyOn(element, "play").mockResolvedValue();
    const pause = vi.spyOn(element, "pause").mockImplementation(() => {});

    observers[0]([{ isIntersecting: true }]);
    expect(play).toHaveBeenCalledOnce();
    observers[0]([{ isIntersecting: false }]);
    expect(pause).toHaveBeenCalledOnce();
  });

  it("never plays with reduced motion", () => {
    const observers = stubBrowser(true);
    mount(HomeLoopVideo, { props });
    expect(observers).toEqual([]);
  });
});
