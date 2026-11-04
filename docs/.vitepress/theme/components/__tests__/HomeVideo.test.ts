// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import HomeVideo from "../HomeVideo.vue";

describe("HomeVideo", () => {
  it("loads nothing from YouTube until the visitor clicks", async () => {
    const wrapper = mount(HomeVideo);
    expect(wrapper.find("iframe").exists()).toBe(false);
    await wrapper.find("button").trigger("click");
    expect(wrapper.find("iframe").attributes("src")).toContain("youtube-nocookie.com");
  });
});
