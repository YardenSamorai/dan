/** Plural forms follow Intl.PluralRules categories. `other` is always required. */
export interface Plural {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
}

type Leaf = string | Plural;

/** A plural needs `other` and only plural-category keys — so `{ vacation, …, other }` stays a namespace. */
type IsPlural<T> = T extends { other: string } ? (Exclude<keyof T, keyof Plural> extends never ? true : false) : false;

/** Turns the literal English dictionary into the shape every other locale must satisfy. */
export type Widen<T> = T extends string ? string : IsPlural<T> extends true ? Plural : { [K in keyof T]: Widen<T[K]> };

type IsLeaf<T> = T extends string ? true : IsPlural<T>;

export type Paths<T, P extends string = ''> = {
  [K in keyof T & string]: IsLeaf<T[K]> extends true ? `${P}${K}` : Paths<T[K], `${P}${K}.`>;
}[keyof T & string];

export type Params = Record<string, string | number>;

export type { Leaf };
