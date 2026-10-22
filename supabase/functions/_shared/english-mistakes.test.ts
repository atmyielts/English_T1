import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { grammarTopicFor, topicFromSubskill, topicSubskill } from "./english-mistakes.ts";

const topic = (original: string, corrected: string, explanation = "", suggested: string | null = null) =>
  grammarTopicFor({ original, corrected, explanation, suggested });

Deno.test("mistakes learners in Uzbekistan often make map to the right lesson", () => {
  assertEquals(topic("more better", "better"), "comparatives");
  assertEquals(topic("the most best", "the best"), "comparatives");
  assertEquals(topic("I am agree", "I agree"), "verb-patterns");
  assertEquals(topic("discuss about the plan", "discuss the plan"), "verb-patterns");
  assertEquals(topic("explain me", "explain to me"), "verb-patterns");
  assertEquals(topic("He work in a bank", "He works in a bank"), "agreement");
  assertEquals(topic("These plans needs more time", "These plans need more time"), "agreement");
  assertEquals(topic("She don't like it", "She doesn't like it"), "agreement");
  assertEquals(topic("many informations", "much information"), "quantifiers");
  assertEquals(topic("She opened door", "She opened the door"), "articles");
  assertEquals(topic("I bought a umbrella", "I bought an umbrella"), "articles");
  assertEquals(topic("arrived on 6 p.m.", "arrived at 6 p.m."), "prepositions");
  assertEquals(topic("Yesterday I watch a film", "Yesterday I watched a film"), "past-simple");
  assertEquals(topic("I didn't used to", "I didn't use to"), "used-to");
});

Deno.test("explanations and model suggestions are used when given", () => {
  assertEquals(topic("I go there yesterday", "I went there yesterday", "Use the past simple for a finished time."), "past-simple");
  assertEquals(topic("I live here since 2020", "I have lived here since 2020", "Use the present perfect with since."), "present-perfect");
  assertEquals(topic("x", "y", "", "passive"), "passive");
  assertEquals(topic("x", "y", "", "not-a-topic"), null);
});

Deno.test("spelling, punctuation and capital letters are not grammar topics", () => {
  assertEquals(topic("because i dont", "because I don't"), null);
  assertEquals(topic("Aziz", "Aziz."), null);
  assertEquals(topic("recieve", "receive"), null);
  assertEquals(topic("big", "large"), null);
});

Deno.test("topic subskill keys round-trip", () => {
  assertEquals(topicSubskill("articles"), "grammar.articles");
  assertEquals(topicFromSubskill("grammar.articles"), "articles");
  assertEquals(topicFromSubskill("writing.grammar"), null);
  assertEquals(topicFromSubskill("grammar.unknown"), null);
});
