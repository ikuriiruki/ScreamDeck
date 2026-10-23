import { expect, test } from "vitest";
import { weightPercents } from "./weights";

test("weightPercents sums to 100", () => expect(weightPercents([3, 2, 2, 1, 1])).toEqual([34, 22, 22, 11, 11]));
test("weightPercents of empty", () => expect(weightPercents([])).toEqual([]));
