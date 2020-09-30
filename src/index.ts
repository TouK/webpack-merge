import { Configuration } from "webpack";
import wildcard from "wildcard";
import mergeWith from "./merge-with";
import joinArrays from "./join-arrays";
import unique from "./unique";
import { CustomizeRule, ICustomizeOptions, Key } from "./types";
import { isPlainObject } from "./utils";

function merge(
  firstConfiguration: Configuration | Configuration[],
  ...configurations: Configuration[]
): Configuration {
  return mergeWithCustomize({})(firstConfiguration, ...configurations);
}

function mergeWithCustomize(options: ICustomizeOptions) {
  return function mergeWithOptions(
    firstConfiguration: Configuration | Configuration[],
    ...configurations: Configuration[]
  ): Configuration {
    // No configuration at all
    if (!firstConfiguration) {
      return {};
    }

    // @ts-ignore
    if (firstConfiguration.then) {
      throw new TypeError("Promises are not supported");
    }

    if (configurations.length === 0) {
      if (Array.isArray(firstConfiguration)) {
        // Empty array
        if (firstConfiguration.length === 0) {
          return {};
        }

        // @ts-ignore
        if (firstConfiguration[0].then) {
          throw new TypeError("Promises are not supported");
        }

        return mergeWith(firstConfiguration, joinArrays(options));
      }

      return firstConfiguration;
    }

    return mergeWith(
      [firstConfiguration].concat(configurations),
      joinArrays(options)
    );
  };
}

type Rules = { [s: string]: CustomizeRule | Rules };

function customizeArray(rules: Rules) {
  return (a: any, b: any, key: Key) => {
    const matchedRule =
      Object.keys(rules).find(rule => wildcard(rule, key)) || "";

    if (matchedRule) {
      switch (rules[matchedRule]) {
        case CustomizeRule.Prepend:
          return [...b, ...a];
        case CustomizeRule.Replace:
          return b;
        case CustomizeRule.Append:
        default:
          return [...a, ...b];
      }
    }

    return mergeWithRules({ rules, key, a, b });
  };
}

function mergeWithRules({
  rules,
  key,
  a,
  b
}: {
  rules: Rules;
  key: Key;
  a: any;
  b: any;
}) {
  let currentRule: CustomizeRule | Rules = rules;
  key.split(".").forEach(k => {
    currentRule = currentRule[k];
  });

  if (isPlainObject(currentRule)) {
    // TODO: Concat anything from b that didn't match?
    return a.map(ao => {
      const ret = {};

      const rulesToMatch: string[] = [];
      const operations = {};
      Object.entries(currentRule).forEach(([k, v]) => {
        if (v === CustomizeRule.Match) {
          rulesToMatch.push(k);
        } else {
          operations[k] = v;
        }
      });

      const bMatches = b.filter(o =>
        rulesToMatch.every(rule => ao[rule].toString() === o[rule].toString())
      );

      // TODO: Extract as a function to apply
      Object.entries(ao).forEach(([k, v]) => {
        switch (currentRule[k]) {
          case CustomizeRule.Match:
            ret[k] = v;
            break;
          case CustomizeRule.Append:
            ret[k] =
              bMatches.length > 0
                ? (v as Array<any>).concat(last(bMatches)[k])
                : v;
            break;
          case CustomizeRule.Prepend:
            ret[k] = bMatches.length > 0 ? last(bMatches)[k].concat(v) : v;
            break;
          case CustomizeRule.Replace:
            ret[k] = bMatches.length > 0 ? last(bMatches)[k] : v;
            break;
          default:
            const rules = operations[k];
            const b = bMatches.map(o => o[k]).flat();

            // console.log({ rules, k, v, b });

            // TODO: Map through v and apply rules per each
            ret[k] = mergeWithRules({ rules, key: k, a: v, b });
            break;
        }
      });

      return ret;
    });
  }

  return [];
}

function last(arr) {
  return arr[arr.length - 1];
}

function customizeObject(rules: { [s: string]: CustomizeRule }) {
  return (a: any, b: any, key: Key) => {
    switch (rules[key]) {
      case CustomizeRule.Prepend:
        return mergeWith([b, a], joinArrays());
      case CustomizeRule.Replace:
        return b;
      case CustomizeRule.Append:
        return mergeWith([a, b], joinArrays());
    }
  };
}

export {
  // This will show up as .default in CommonJS but for TS it's backwards-compatible
  merge as default,
  merge,
  mergeWithCustomize,
  unique,
  customizeArray,
  customizeObject,
  CustomizeRule
};
