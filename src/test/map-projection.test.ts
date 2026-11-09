import { describe, expect, it } from "vitest";
import { projectPoint, unprojectDelta } from "@/components/pw/map-projection";
describe("Oblique geography alignment", () => {
  it("keeps the map center fixed and reverses projected pointer movement", () => {
    expect(projectPoint([350,220],[350,220])).toEqual([350,220]);
    const projected = projectPoint([380,270],[350,220]);
    const delta = unprojectDelta([projected[0]-350,projected[1]-220]);
    expect(delta[0]).toBeCloseTo(30); expect(delta[1]).toBeCloseTo(50);
  });
  it("uses flat coordinates with reduced motion", () => {
    expect(projectPoint([30,50],[0,0],true)).toEqual([30,50]);
    expect(unprojectDelta([30,50],true)).toEqual([30,50]);
  });
});