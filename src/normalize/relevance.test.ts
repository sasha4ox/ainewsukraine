import assert from "node:assert/strict";
import { test } from "node:test";
import { isUkraineRelevant } from "./relevance.ts";

test("keeps the Ukraine stories from recent digests", () => {
  const keep = [
    "ЗСУ уразили пускову установку Іскандера, Зеленський попередив про нові удари Росії",
    "НБУ підвищив облікову ставку до 16,5% через зростання інфляційних ризиків. Національного банку України",
    "Пентагон відмовився розслідувати обмеження Starlink в Україні",
    "Екссуддю Тандира засудили до 9 років за смертельну ДТП на блокпосту в Києві",
    "Україна та Нідерланди розпочали спільний проєкт у сфері ППО Bliksem",
    "Україна отримала $404,5 млн від Японії та Світового банку",
    "У Олешках зафіксовано 30 годин режиму тиші",
    "У ЗСУ заявили про 196 боєзіткнень на Покровському напрямку",
    "Зеленський обговорив з лідерами Фінляндії та Норвегії їхні контакти з Путіним",
    "Повітряні сили збили 40 шахедів",
  ];
  for (const headline of keep) {
    assert.equal(isUkraineRelevant(headline), true, headline);
  }
});

test("drops foreign news that Ukrainian desks also carry", () => {
  const drop = [
    "Трамп не втручатиметься в ситуацію в Бразилії після виїзду Болсонару до США",
    "У Німеччині затримали двох білорусів за підозрою у підготовці диверсій",
    "Trump says he will not intervene after Bolsonaro left Brazil",
  ];
  for (const headline of drop) {
    assert.equal(isUkraineRelevant(headline), false, headline);
  }
});
