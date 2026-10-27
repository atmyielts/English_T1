<!--meta
{
  "slug": "math-advanced-math",
  "title": "Math: Advanced Math",
  "summary": "Equivalent expressions, quadratics, exponentials, polynomials, radical and rational equations, nonlinear systems and function behaviour on the digital SAT, with eleven worked examples, the traps behind wrong answers, Desmos decision rules and a ten-question drill.",
  "module_key": "domain_math",
  "sort_order": 8,
  "group": "math",
  "hero_kicker": "Module 8",
  "seo_title": "SAT Advanced Math Guide: Quadratics, Exponentials and Nonlinear Equations | SAT Playbook",
  "seo_description": "A complete guide to the Advanced Math domain of the digital SAT, with original worked examples, extraneous-solution checks, quadratic and exponential strategy, Desmos techniques and a practice drill.",
  "seo_keywords": ["SAT", "SAT Math", "SAT Advanced Math", "quadratics", "exponential functions", "nonlinear equations", "equivalent expressions", "Digital SAT"],
  "related_practice": [
    { "label": "Advanced Math question bank", "url": "https://practice.sat.schood.online/bank?section_type=math&domain=advanced_math" },
    { "label": "Hard Advanced Math questions", "url": "https://practice.sat.schood.online/bank?section_type=math&domain=advanced_math&difficulty=hard" },
    { "label": "Today's practice session", "url": "https://practice.sat.schood.online/today" },
    { "label": "Full SAT simulator", "url": "https://sat.schood.online" }
  ],
  "sources": [
    { "key": "math", "note": "Primary source for Math domains, question counts per domain and in-context share", "primary": true },
    { "key": "spec", "note": "Advanced Math skill list, domain weight and question ordering" },
    { "key": "framework", "note": "Full skill definitions for the Advanced Math domain" },
    { "key": "directions", "note": "Student-produced response entry rules and Math directions" },
    { "key": "calc", "note": "Embedded Desmos calculator and handheld calculator policy" },
    { "key": "practice-tests", "note": "Official full-length practice in Bluebook" },
    { "key": "khan", "note": "Free official practice" }
  ]
}
-->
## Why Advanced Math Matters

Advanced Math is the other heavyweight of the SAT Math section. College Board's specifications place it at about **35% of Math questions, roughly 13 to 15 of the 44**, the same share as Algebra. It is also the domain where the hardest questions in the second module most often come from.

Advanced Math is everything nonlinear: quadratics, exponentials, polynomials, radicals, rational expressions, absolute value and the language of functions. College Board describes it as the skills that prepare students for more advanced math courses. In practice, the questions test three things: whether you can rewrite an expression without changing its value, whether you can solve a nonlinear equation without losing or inventing solutions, and whether you can read a function's behaviour from its formula or graph.

The good news is that Advanced Math is the domain where the built-in Desmos graphing calculator helps most. Many questions that look long by hand become a graph and a click. The bad news is that the same questions punish students who type before they think. This module teaches both the algebra and the judgement about when to graph.

## Key Outcomes

<!-- checklist -->
- Expand, factor and simplify polynomial, rational and exponential expressions, and recognise equivalent forms.
- Move between standard, vertex and factored forms of a quadratic and know what each form reveals.
- Use the discriminant to count real solutions without solving.
- Build and interpret exponential growth and decay models, including percent change and doubling time.
- Apply the factor and remainder theorems to polynomials.
- Solve radical and rational equations and reject extraneous solutions.
- Solve systems that combine a line and a curve, by algebra and by graphing.
- Evaluate, compose and transform functions written in function notation.

## Where Advanced Math Sits in the Math Section

The Math section has **two modules of 22 questions each, 35 minutes per module**, and two questions in each module are unscored pretest items you cannot identify. Every module includes all four domains, ordered from easiest to hardest.

| Fact | What it means for Advanced Math |
|---|---|
| About 35% of Math, 13–15 questions | Roughly 6 to 8 Advanced Math questions per module. |
| Easiest to hardest within each module | Early items are factoring or evaluating; late items are parameters, systems and equivalent forms. |
| About 25% student-produced response | Expect several typed answers, some of them decimals from irrational values. |
| Calculator allowed throughout | Desmos is available on every question, which changes how you solve many nonlinear problems. |
| About 30% in context | Exponential growth, projectile height and area models are common stories. |

College Board groups the domain into three skills: **equivalent expressions**, **nonlinear equations in one variable and systems of equations in two variables**, and **nonlinear functions**.

## The Three Skill Families

### Equivalent expressions

You rewrite an expression into a form that is equal for every allowed input: expanding, factoring, combining rational expressions, applying exponent rules. Questions usually say "which expression is equivalent to..." and offer four look-alike forms.

### Nonlinear equations and systems

You solve equations such as x² − 9x + 20 = 0, √(x + 7) = x − 5 or 2/(x + 1) = x/3, and systems that pair a line with a parabola. The key risks are lost solutions (dividing by a variable) and extra solutions (squaring both sides or multiplying by an expression that can be zero).

### Nonlinear functions

You interpret and use functions: the vertex of a parabola, the growth factor of an exponential, the zeros of a polynomial, the effect of a transformation, the value of a composition. Context questions ask what a parameter means in a story.

## Skill: Equivalent Expressions

### Tools you need

- **Distribution and FOIL**: (2x − 3)(x + 4) = 2x² + 5x − 12.
- **Special products**: (a + b)² = a² + 2ab + b²; (a − b)² = a² − 2ab + b²; (a + b)(a − b) = a² − b².
- **Factoring**: greatest common factor first, then trinomials, then difference of squares.
- **Exponent rules**: xᵃ × xᵇ = xᵃ⁺ᵇ; (xᵃ)ᵇ = xᵃᵇ; x⁻ᵃ = 1/xᵃ; x^(1/2) = √x; x^(m/n) is the nth root of xᵐ.
- **Rational expressions**: combine over a common denominator; cancel only common factors, never common terms.

### Two fast ways to check equivalence

1. **Pick a number.** Substitute a simple value such as x = 2 into the original and into each choice. A choice that gives a different value is wrong. Avoid 0 and 1, which make many different expressions look alike.
2. **Graph both.** In Desmos, type the original as `y=` and a choice as another `y=`. If the graphs lie exactly on top of each other, the expressions are equivalent.

The second method is slower for simple polynomials but very reliable for messy rational or exponential expressions.

## Worked Example 1: Expand and Combine

**Question (multiple choice).** Which expression is equivalent to (2x − 3)² − (x + 1)(x − 1)?

A) 3x² − 12x + 10
B) 3x² − 12x + 8
C) 3x² + 10
D) 5x² − 12x + 8

**Solution.** (2x − 3)² = 4x² − 12x + 9 and (x + 1)(x − 1) = x² − 1. Subtracting: 4x² − 12x + 9 − x² + 1 = **3x² − 12x + 10**. The answer is **A**.

**Why the other choices are tempting.**

- **B** comes from subtracting x² − 1 as if it were x² + 1: the minus sign was not distributed to the −1.
- **C** comes from squaring term by term, (2x)² − 3², which loses the middle term −12x. Squaring a binomial always produces a middle term.
- **D** comes from adding the product instead of subtracting it.

**Check by numbers.** At x = 2, the original is (1)² − (3)(1) = −2. Choice A gives 12 − 24 + 10 = −2. Choice B gives −4, so it is out.

## Skill: The Three Forms of a Quadratic

| Form | Example | What it shows directly |
|---|---|---|
| Standard | f(x) = 2x² − 12x + 7 | y-intercept (7); opening direction (sign of a) |
| Vertex | f(x) = 2(x − 3)² − 11 | Vertex (3, −11); minimum or maximum value; axis of symmetry x = 3 |
| Factored | f(x) = (x − 5)(x + 3) | Zeros (x-intercepts) at 5 and −3 |

### Facts to know cold

- For f(x) = ax² + bx + c, the vertex is at **x = −b/(2a)**.
- If a > 0 the parabola opens up and the vertex is a minimum; if a < 0 it opens down and the vertex is a maximum.
- The axis of symmetry is halfway between the zeros.
- For ax² + bx + c = 0, the **sum of the solutions is −b/a** and the **product is c/a**. These give quick answers without solving.

### Which form to use

When a question asks for a maximum, minimum or vertex, aim for vertex form or use −b/(2a). When it asks for intercepts or solutions, aim for factored form. When choices are written in different forms, the question is often "which form displays a certain feature as a constant or coefficient?"

## Worked Examples: Vertex and Zeros

**Example 2 (student-produced response).** The function f is defined by f(x) = 2x² − 12x + 7. What is the minimum value of f(x)?

**Solution.** The vertex is at x = −(−12)/(2 × 2) = 3. Then f(3) = 2(9) − 36 + 7 = **−11**. Enter `-11`. In vertex form, f(x) = 2(x − 3)² − 11, which shows the minimum immediately.

**Trap.** The question asks for the minimum **value** (the y-coordinate), not where it occurs. Entering 3 is the most common wrong answer.

**Desmos path.** Type `f(x)=2x^2-12x+7`. Click the bottom of the parabola; Desmos marks the point (3, −11).

**Example 3 (student-produced response).** The graph of y = x² − 2x − 15 crosses the x-axis at two points. What is the distance between those two points?

**Solution.** Factor: (x − 5)(x + 3) = 0, so the zeros are 5 and −3. The distance is 5 − (−3) = **8**. Enter `8`.

**Traps.** Computing 5 + (−3) = 2 adds the zeros instead of finding the distance between them. Note also the sign flip: the factor (x + 3) gives the zero x = −3, not 3.

## The Discriminant: Counting Solutions

For ax² + bx + c = 0, the **discriminant** is b² − 4ac.

- **Positive**: two distinct real solutions; the parabola crosses the x-axis twice.
- **Zero**: exactly one real solution; the parabola touches the x-axis at its vertex.
- **Negative**: no real solutions; the parabola never reaches the x-axis.

The SAT uses the discriminant for questions that contain a constant: "for what value of c does the equation have exactly one solution?" It also appears hidden inside systems: when a line meets a parabola, substitute and the discriminant of the resulting quadratic tells you how many intersection points there are.

**Example 4 (multiple choice).** For which value of c does x² + 6x + c = 0 have no real solutions?

A) 0  B) 5  C) 9  D) 12

**Solution.** The discriminant is 36 − 4c. It is negative when c > 9. Only **D (12)** works: 36 − 48 = −12. Choice C gives a discriminant of 0, which means exactly one solution, not none; it is the trap for students who stop at the boundary value.

## Skill: Exponential Functions

An exponential function multiplies by the same factor for each equal step in the input.

### The two standard forms

- **Growth or decay by a percent**: f(t) = a(1 + r)ᵗ for growth, a(1 − r)ᵗ for decay. Here a is the starting value and r is the rate as a decimal. A 6% increase per year gives a factor of 1.06; a 15% decrease gives 0.85.
- **Multiply by b every k units**: f(t) = a × b^(t/k). A population that doubles every 5 hours is a × 2^(t/5); a quantity that halves every 8 years is a × (1/2)^(t/8).

### Linear versus exponential

- **Linear** change adds the same **amount** each step.
- **Exponential** change multiplies by the same **factor** each step.

In a table, check differences for linear and ratios for exponential. If the ratios between consecutive outputs are constant, the relationship is exponential.

### Equivalent exponential forms

Exponent rules let you rewrite growth over different periods. For example, a monthly factor and an annual factor are related by a twelfth power, and 1.21ᵗ equals (1.1)²ᵗ. Questions may ask which form shows a certain percent change per some other time unit.

## Worked Example 5: Growth and Decay

**Part A (multiple choice).** A car is worth $24,000 and loses 15% of its value each year. Which function gives its value V, in dollars, t years from now?

A) V = 24,000(0.15)ᵗ
B) V = 24,000(0.85)ᵗ
C) V = 24,000(1.15)ᵗ
D) V = 24,000 − 0.15t

**Solution.** Losing 15% leaves 85% each year, so the factor is 0.85. The answer is **B**. After 2 years, V = 24,000 × 0.85² = $17,340.

- **A** keeps only the 15% that was lost, not the 85% that remains.
- **C** is 15% growth.
- **D** is linear and subtracts 0.15 dollars per year, not 15% of the value.

**Part B (student-produced response).** A town's population is modeled by P(t) = 800(1.06)ᵗ, where t is years after 2020. To the nearest whole number, what does the model predict for t = 3?

**Solution.** 800 × 1.06³ = 800 × 1.191016 = 952.8128, so enter **953**. The model shows 6% growth per year, because the factor 1.06 means each year's population is 106% of the previous year's.

## Skill: Polynomials, Factors and Remainders

### The factor theorem

If p(a) = 0, then (x − a) is a factor of p(x), and a is a zero of p. The reverse is also true. So "x − 3 is a factor" means p(3) = 0.

### The remainder theorem

When p(x) is divided by (x − a), the remainder is p(a). You rarely need long division on the SAT; evaluating p(a) is faster.

### Zeros and graphs

The zeros of a polynomial are where its graph meets the x-axis. A factor that appears twice, such as (x − 2)², makes the graph touch the axis and turn around at x = 2 instead of crossing it.

**Example 6 (student-produced response).** The polynomial p(x) = x³ − 4x² + kx − 6 has (x − 3) as a factor, where k is a constant. What is the value of k?

**Solution.** Because (x − 3) is a factor, p(3) = 0: 27 − 36 + 3k − 6 = 0, so 3k − 15 = 0 and **k = 5**. Enter `5`.

**Trap.** Substituting x = −3 (because the factor shows "−3") gives a different, wrong equation. The zero of (x − a) is x = a.

## Skill: Radical and Rational Equations

These equations are where **extraneous solutions** live: values your algebra produces that do not satisfy the original equation.

### Radical equations

To solve √(expression) = something, isolate the radical, then square both sides. Squaring can create false solutions because both a positive and a negative right side square to the same number. **Always substitute every candidate back into the original equation.** A principal square root is never negative.

### Rational equations

To solve an equation with variables in denominators, multiply both sides by the common denominator. Before you do, write down the values that make any denominator zero. Any candidate equal to one of those values must be rejected.

### Why this matters on the test

Answer choices on these questions are designed around the extraneous value. Typical choices include "the false solution only," "both solutions," "the true solution only" and "no solution." If you skip the check, the wrong answer is waiting for you.

## Worked Examples: Extraneous Solutions

**Example 7 (multiple choice).** What is the solution set of √(x + 7) = x − 5?

A) {2}  B) {9}  C) {2, 9}  D) No solution

**Solution.** Square both sides: x + 7 = x² − 10x + 25, so x² − 11x + 18 = 0 and (x − 9)(x − 2) = 0. Candidates: 9 and 2. Check: x = 9 gives √16 = 4 and 9 − 5 = 4, true. x = 2 gives √9 = 3 but 2 − 5 = −3, false. The answer is **B**. Choice C is the trap for anyone who skips the check.

**Example 8 (multiple choice).** What value of x satisfies x/(x − 3) − 2 = 3/(x − 3)?

A) −3  B) 0  C) 3  D) There is no such value.

**Solution.** First note that x ≠ 3. Multiply both sides by (x − 3): x − 2(x − 3) = 3, so −x + 6 = 3 and x = 3. But x = 3 makes the denominators zero, so it is extraneous. The answer is **D**. Choice C is the algebra result without the restriction.

**Desmos path.** Graph `y=x/(x-3)-2` and `y=3/(x-3)`. The curves never intersect, which confirms there is no solution.

## Skill: Nonlinear Systems

A nonlinear system usually pairs a line with a parabola, or two parabolas. The solutions are the intersection points.

### Algebra method

Set the two expressions for y equal, move everything to one side, and solve the resulting quadratic. The number of real solutions of that quadratic is the number of intersection points: two, one (the line is tangent) or none.

### Desmos method

Type both equations, then click each intersection. This is often the fastest method for a "how many solutions" or "what is a solution" question.

**Example 9 (student-produced response).** The system y = x² − 4x + 1 and y = 2x − 8 has exactly one solution (x, y). What is the value of x + y?

**Solution.** Set the right sides equal: x² − 4x + 1 = 2x − 8, so x² − 6x + 9 = 0 and (x − 3)² = 0. The only solution is x = 3, and y = 2(3) − 8 = −2. So x + y = **1**. Enter `1`.

**What the zero discriminant tells you.** The quadratic x² − 6x + 9 has discriminant 36 − 36 = 0, so the line is tangent to the parabola. If a question asks for the value of a constant that makes a line tangent, set the discriminant equal to 0.

## Skill: Function Notation, Composition and Transformations

### Notation and composition

- f(a) is the output for input a. Solving f(x) = 7 means finding the input that gives output 7.
- f(g(x)) means apply g first, then f. Work from the **inside out**.

### Transformations of y = f(x)

| Rewrite | Effect on the graph |
|---|---|
| f(x) + k | Shift up k units |
| f(x) − k | Shift down k units |
| f(x − h) | Shift right h units |
| f(x + h) | Shift left h units |
| −f(x) | Reflect over the x-axis |
| f(−x) | Reflect over the y-axis |
| a × f(x) | Vertical stretch by a (compression if 0 < a < 1) |

The horizontal shifts feel backwards: f(x − 2) moves the graph **right** 2. When in doubt, graph a simple f in Desmos and try it.

### Absolute value

|A| = B with B > 0 splits into two equations: A = B and A = −B. If B is negative there is no solution. The graph of y = |x| is a V shape with its vertex at the origin.

## Worked Examples: Composition and Absolute Value

**Example 10 (multiple choice).** If f(x) = x² − 3 and g(x) = 2x + 1, what is the value of f(g(2))?

A) 3  B) 5  C) 22  D) 25

**Solution.** Inside first: g(2) = 5. Then f(5) = 25 − 3 = **22**. The answer is **C**.

- **A** is g(f(2)) = g(1) = 3, the composition in the wrong order.
- **B** is f(2) × g(2) = 1 × 5: multiplying instead of composing.
- **D** forgets the −3 after squaring.

**Example 11 (student-produced response).** What is the sum of all solutions to |2x − 5| = 9?

**Solution.** Split: 2x − 5 = 9 gives x = 7, and 2x − 5 = −9 gives x = −2. The sum is **5**. Enter `5`. Both solutions check: |14 − 5| = 9 and |−4 − 5| = 9.

## Common Traps in Advanced Math

### Expression traps

- Squaring a binomial term by term: (a − b)² is not a² − b².
- Cancelling terms instead of factors: (x + 6)/x is not 7 or 6.
- Distributing a negative only to the first term of a subtracted product.

### Equation traps

- Skipping the extraneous check after squaring or multiplying by a variable expression.
- Dividing both sides by x and losing the solution x = 0. Factor instead.
- Taking only the positive root: x² = 16 has solutions 4 and −4.

### Function traps

- Answering where a maximum occurs when the question asks for the maximum value.
- Reading f(x − h) as a left shift.
- Composing in the wrong order.
- Confusing a growth rate (0.06) with a growth factor (1.06).

### Context traps

- In h(t) = −16t² + 64t + 5, the 5 is the starting height, not the maximum height.
- In a decay model, the percent lost and the factor kept add to 1, so a factor of 0.85 means 15% is lost.

## Check Every Candidate

<!-- callout: Extraneous solutions are built into the answer choices -->
Whenever you square both sides of an equation or multiply by an expression containing the variable, your algebra can produce values that do not satisfy the original equation. On the SAT those values are deliberately offered as answer choices. Substitute every candidate back into the original equation, or graph both sides in Desmos, before you answer.

## Decision Rules: By Hand, Desmos or Numbers

### Solve by hand when

- A quadratic factors easily, such as x² − 9x + 20.
- The question asks about structure: which form shows the vertex, what a coefficient means, what value of c gives one solution.
- You need an exact answer that Desmos will only show as a decimal, such as a fraction or a radical in the choices.

### Use Desmos when

- You need the vertex, zeros or intersections of a curve. Click the gray points Desmos marks.
- You are checking for extraneous solutions: graph each side as its own `y=` and look for intersections.
- The question asks how many solutions a nonlinear system has.
- You are checking whether two expressions are equivalent: graph both and see if they overlap completely.

### Use numbers when

- Choices are expressions in x. Pick x = 2 or x = 3, evaluate the original and each choice, and keep the one that matches.
- A question involves an unknown constant in an identity: choose convenient x values to create equations for the constant.

### When Desmos can mislead you

Desmos shows decimals rounded on screen. If choices include √2 or a fraction, convert or compare carefully. Also make sure you typed parentheses around fractional exponents and denominators: `2^(x/5)` is not `2^x/5`. The [Desmos and calculator strategy module](https://playbook.sat.schood.online/desmos-and-calculator-strategy) covers these techniques step by step.

## Entering Student-Produced Responses

Advanced Math SPR answers are often negative, fractional or irrational, so the official Bluebook rules matter:

- **Up to 5 characters for a positive answer, up to 6 for a negative answer** (the minus sign counts).
- Fractions are fine if they fit. If a fraction does not fit, enter the decimal.
- For long decimals, **truncate or round at the fourth digit** so the space is filled. If an answer is √8 ≈ 2.828427, enter `2.828` or `2.829`, never `√8` and never `2.8`.
- **Mixed numbers** are not allowed: enter 5/2 or 2.5, not 2 1/2.
- **No symbols** such as %, $ or commas.
- If a question has two correct answers (such as both roots of a quadratic) and asks for one, **enter only one**.

Read whether the question asks for a value rounded to a certain place, such as "to the nearest whole number"; if it does, follow that instruction instead.

## Timing by Question Position

| Position in module | Typical Advanced Math content | Target time |
|---|---|---|
| Questions 1–7 | Evaluate a function, factor a simple quadratic, identify an exponential factor | 30–60 seconds |
| Questions 8–15 | Vertex questions, composition, radical equations, growth models | 60–100 seconds |
| Questions 16–22 | Parameters, tangent systems, equivalent forms, dense contexts | 100–150 seconds |

### Pacing habits

- On late-module questions, spend the first 15 seconds deciding the method: algebra, graph or numbers.
- If an equivalence question is taking too long algebraically, switch to picking a number.
- Mark and move on when you pass about two and a half minutes; return if time remains.
- Never leave an answer blank. College Board advises that guessing is generally better than an empty answer.

How your first module affects the second is explained in [Pacing and adaptive modules](https://playbook.sat.schood.online/pacing-and-adaptive-modules).

## Advanced Math Drill: Ten Questions

Allow about 14 minutes. Answers follow in the next section.

**1.** Which expression is equivalent to (x + 4)(x − 4) + 16?
A) x²  B) x² + 32  C) x² − 16  D) x² + 8x

**2.** (SPR) What is the larger solution to x² − 9x + 20 = 0?

**3.** (SPR) The function f is defined by f(x) = −(x − 4)² + 11. What is the maximum value of f(x)?

**4.** If y = 3(2)ˣ, what is the value of y when x = 4?
A) 24  B) 48  C) 81  D) 1,296

**5.** (SPR) If √(2x + 6) = 4, what is the value of x?

**6.** A bacteria culture starts with 300 cells and doubles every 5 hours. Which function gives the number of cells after h hours?
A) 300 × 2^(5h)  B) 300 × 2^(h/5)  C) 300(1.05)ʰ  D) 300 + (2/5)h

**7.** (SPR) The graph of g(x) = x² + bx + 9, where b is a positive constant, touches the x-axis at exactly one point. What is the value of b?

**8.** What is the sum of all solutions to 2/(x + 1) = x/3?
A) −1  B) 1  C) −6  D) 5

**9.** (SPR) The system y = x² + 2 and y = kx, where k is a positive constant, has exactly one solution. What is the value of k?

**10.** The function f is defined by f(x) = (x − 2)(x + 6). Which equivalent form shows the minimum value of f as a constant?
A) f(x) = (x + 2)² − 16
B) f(x) = (x − 2)² − 16
C) f(x) = (x + 2)² − 12
D) f(x) = (x + 4)² − 12

## Drill Answers and Explanations

**1. A (x²).** (x + 4)(x − 4) = x² − 16, and adding 16 gives x². B adds 16 twice (a sign slip); C forgets the +16.

**2. 5.** Factor: (x − 4)(x − 5) = 0, so the solutions are 4 and 5. The larger is 5.

**3. 11.** In vertex form −(x − 4)² + 11, the leading coefficient is negative, so the vertex (4, 11) is a maximum. The maximum value is 11; entering 4 gives the location instead.

**4. B (48).** 2⁴ = 16 and 3 × 16 = 48. D comes from (3 × 2)⁴, which ignores order of operations; C is 3⁴; A is 3 × 2 × 4, treating the exponent as a multiplier.

**5. 5.** Square both sides: 2x + 6 = 16, so x = 5. Check: √16 = 4. True.

**6. B.** The factor 2 applies once every 5 hours, so the exponent is h/5. Check at h = 10: 300 × 2² = 1,200, two doublings. A doubles 5 times per hour; C is 5% growth per hour; D is linear.

**7. 6.** Touching the x-axis once means the discriminant is zero: b² − 36 = 0, so b = 6 or −6. Since b is positive, b = 6.

**8. A (−1).** Cross-multiply: 6 = x(x + 1), so x² + x − 6 = 0, which factors as (x + 3)(x − 2) = 0. Both −3 and 2 are allowed because neither makes x + 1 zero. The sum is −1. C is the product of the solutions; B has the sign of −b/a reversed.

**9. 2.828 (or 2.829).** Substitute: x² + 2 = kx, so x² − kx + 2 = 0. Exactly one solution means k² − 8 = 0, so k = √8 ≈ 2.828427. Because k is positive and the box holds 5 characters, enter `2.828` or `2.829`. Entering 2.8 is not precise enough.

**10. A.** Expand: x² + 4x − 12. Complete the square: x² + 4x + 4 − 16 = (x + 2)² − 16. The minimum value, −16, appears as a constant. The vertex is at x = −2, halfway between the zeros 2 and −6. B has the wrong sign inside; C and D do not expand to the same polynomial.

**Using your result.** Nine or ten correct: move to hard bank questions. Six to eight: redo misses tomorrow without notes. Five or fewer: return to the skill sections first.

## A Weekly Advanced Math Routine

- **Day 1: Forms (30 minutes).** Take five quadratics and write each in all three forms. Then do 10 bank questions on quadratics.
- **Day 2: Exponentials (25 minutes).** Write models from stories (percent change, doubling, halving) and do 10 [Advanced Math bank](https://practice.sat.schood.online/bank?section_type=math&domain=advanced_math) questions on growth and decay.
- **Day 3: Extraneous check (25 minutes).** Solve six radical and rational equations by hand, then verify each with Desmos.
- **Day 4: Hard set (30 minutes).** Do 8–10 [hard Advanced Math questions](https://practice.sat.schood.online/bank?section_type=math&domain=advanced_math&difficulty=hard). Before solving each, write the method you will use.
- **Day 5: Error replay (20 minutes).** Redo every question missed this week without explanations.
- **Weekend: Timed module.** Take a timed Math module in the [simulator](https://sat.schood.online) or an official Bluebook practice test and note which Advanced Math questions slowed you down.

Keep an error log line for each miss: the skill, the trap and the rule you will use next time.

## Priorities by Current Level

### Math scores below about 500

- Factor simple quadratics and evaluate functions quickly; these questions are early in each module.
- Learn to graph any equation in Desmos and click its zeros, vertex and intersections.
- Learn the difference between linear (add) and exponential (multiply) change.
- Practise SPR entry for negative and fractional answers.

### Math scores from about 500 to 650

- Master the three quadratic forms and the vertex formula.
- Make the extraneous-solution check automatic.
- Learn the discriminant and the sum and product of solutions.
- Learn composition and the transformation table.

### Math scores above about 650

- Expect parameter questions (tangency, number of solutions, identities) late in the harder second module.
- Practise equivalent exponential forms and completing the square under time pressure.
- Use the discriminant on line-and-parabola systems with unknown constants.
- Verify every late-module answer with a second method when time allows.

## Frequently Asked Questions

### Is Advanced Math harder than Algebra?

The content is more varied, and many of the hardest questions in the second module come from this domain. But Desmos helps more here than anywhere else, so students who practise graphing often find their Advanced Math accuracy rises quickly.

### Do I need the quadratic formula?

It helps for quadratics that do not factor, and the discriminant comes from it. Desmos can find decimal roots, but when choices contain radicals, the formula gives the exact form.

### Is trigonometry part of Advanced Math?

No. Trigonometry belongs to Geometry and Trigonometry, which is covered in its own module.

### How do I know if a question is about equivalent expressions?

Look for "which expression is equivalent to" or "which of the following is equal to" with four expressions as choices. Picking a number or graphing both sides is the quickest check.

### What if Desmos shows no intersection when I expected one?

Check your typing first: missing parentheses around exponents or denominators is the usual cause. If the input is correct, no intersection means no real solution.

## Related Practice

- [Advanced Math question bank](https://practice.sat.schood.online/bank?section_type=math&domain=advanced_math): all difficulty levels.
- [Hard Advanced Math questions](https://practice.sat.schood.online/bank?section_type=math&domain=advanced_math&difficulty=hard): upper-module style practice.
- [Medium Advanced Math questions](https://practice.sat.schood.online/bank?section_type=math&domain=advanced_math&difficulty=medium): the core of each module.
- [Today's practice session](https://practice.sat.schood.online/today): a short mixed set chosen for you.
- [SAT simulator](https://sat.schood.online): full timed sections.

## Next Steps

- Learn the graphing techniques used throughout this module in [Desmos and calculator strategy](https://playbook.sat.schood.online/desmos-and-calculator-strategy).
- Review linear foundations in [Math: Algebra](https://playbook.sat.schood.online/math-algebra).
- Continue to [Math: Problem-Solving and Data Analysis](https://playbook.sat.schood.online/math-problem-solving-data-analysis) and [Math: Geometry and Trigonometry](https://playbook.sat.schood.online/math-geometry-trigonometry).
- Plan your timing with [Pacing and adaptive modules](https://playbook.sat.schood.online/pacing-and-adaptive-modules).
