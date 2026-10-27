---
{
  "slug": "guide-desmos-power-moves",
  "title": "Desmos Power Moves for SAT Math",
  "summary": "Premium step-by-step guide to advanced Desmos routines for SAT Math: systems, sliders for parameter questions, inequalities, regressions with constraints, list statistics and checks for student-produced responses, plus when algebra is faster.",
  "parent_slug": "desmos-and-calculator-strategy",
  "sort_order": 1001,
  "level": "advanced",
  "related_modules": ["desmos-and-calculator-strategy", "math-algebra", "math-advanced-math", "math-problem-solving-data-analysis", "math-geometry-trigonometry"],
  "sources": [
    {"url": "https://satsuite.collegeboard.org/in-school-assessments/calculator-policy", "note": "Embedded Desmos graphing and scientific calculator; calculator permitted throughout Math; handheld rules", "primary": true},
    {"url": "https://bluebook.collegeboard.org/students/tools", "note": "Bluebook testing tools including the Desmos calculator and reference sheet"},
    {"url": "https://satsuite.collegeboard.org/media/pdf/english-sat-test-directions-bb.pdf", "note": "Math directions: calculator permitted for all questions; student-produced response entry rules"},
    {"url": "https://help.desmos.com/hc/en-us/articles/360042428612-Nonlinear-Regressions", "note": "Regression models and restricting parameter values"},
    {"url": "https://help.desmos.com/hc/en-us/articles/4407889068557-Lists", "note": "Creating and using lists"},
    {"url": "https://help.desmos.com/hc/en-us/articles/4405633253389-Statistics", "note": "Statistics functions such as mean, median and standard deviation"},
    {"url": "https://help.desmos.com/hc/en-us/articles/4407885334285-Inequalities-and-Restrictions", "note": "Inequalities and domain restrictions with curly brackets"}
  ]
}
---

## Who this guide is for
The public module [Desmos and Calculator Strategy](/desmos-and-calculator-strategy) covers the basics: where the calculator lives in Bluebook, graphing a function, reading intercepts. This premium guide assumes you can do all of that and teaches **routines**: short, repeatable sequences of keystrokes that solve whole families of SAT questions, and the decision rules that tell you when a routine beats algebra and when it does not.

**Verified context.** According to the College Board calculator policy, Bluebook includes an embedded Desmos calculator with graphing and scientific modes, and a calculator may be used throughout the Math section (the Reading and Writing section does not allow one). You may bring an approved handheld calculator instead, but the routines here are Desmos-specific.

**Practise in the right place.** Use the Desmos calculator inside Bluebook's official practice tests at least a few times, so that the layout you train on matches the one you see on test day. If any feature behaves differently there, follow what Bluebook shows.

## The core principle: let the graph answer "how many" and "which"
Algebra is excellent at producing an exact value. Graphs are excellent at answering *how many*, *where* and *which one*. The highest-value Desmos questions on the SAT are therefore:

- **Counting solutions** of systems and equations.
- **Finding a parameter** that changes the number of solutions.
- **Choosing an equivalent expression** from four options.
- **Reading features** (vertex, intercepts, maximum) of a model.
- **Summarising data** (mean, median, spread) without hand arithmetic.

**Decision rule:** if the question asks for a count, a feature or a comparison, open Desmos first. If it asks for an exact value you can reach in two lines of algebra, do the algebra and use Desmos only to check.

## Setup habits that save seconds
- **One question, one clean screen.** Delete old expressions before starting a new question; leftover graphs cause misreads.
- **Zoom to fit.** If a graph is not visible, zoom out or use the zoom-fit control rather than guessing the window.
- **Click points, do not estimate.** Desmos marks intercepts, intersections and turning points as grey dots when you click a curve. Clicking shows exact coordinates (to displayed precision).
- **Use the scientific mode for long arithmetic** only if switching is faster for you; the graphing mode evaluates numbers too.
- **Check angle mode** in the calculator settings before evaluating trigonometric expressions. SAT questions use both degrees and radians.

## Move 1: Solve any equation by graphing both sides
**Routine.**
1. Type the left side as `y = 3(x - 2) + 5`.
2. Type the right side as `y = 2x + 9`.
3. Click the intersection. The x-coordinate is the solution.

Here the lines meet at x = 10, so the equation 3(x − 2) + 5 = 2x + 9 has solution x = 10.

**Why two sides instead of one.** Graphing both sides works for every type of equation (linear, quadratic, exponential, absolute value, radical), and it shows the *number* of solutions at a glance. Many equations in one variable can also be typed directly and Desmos draws vertical lines at the solutions, but the two-sided method is the one that never surprises you.

**Watch out:** for radical and rational equations, the graph shows only real intersections, which automatically removes extraneous solutions that algebra might produce. If your algebra gives two answers and Desmos shows one intersection, trust the graph and recheck the algebra.

## Move 2: Systems of equations, including nonlinear ones
**Routine.**
1. Enter each equation on its own line, exactly as written (Desmos accepts forms like `2x + 3y = 12`; you do not need to solve for y).
2. Click each intersection point to read its coordinates.
3. Count intersections when the question asks how many solutions exist.

**Example.** For y = x² − 4x + 1 and y = x − 3, Desmos shows two intersections, at (1, −2) and (4, 1). Algebra confirms: x² − 5x + 4 = 0 gives x = 1 or x = 4.

**Upper-module variant.** "If (a, b) is a solution to the system and a > 2, what is b?" Click both intersections, choose the one with x-coordinate greater than 2, read b = 1.

## Move 3: Sliders for parameter questions
Parameter questions ("for what value of k...") are where Desmos gives the biggest advantage to students who know this routine.

**Routine.**
1. Type the equation with the parameter as a letter, for example `y = x^2 + bx + 9`.
2. Desmos offers to add a slider for b. Accept it.
3. Drag the slider and watch the graph. Note the value where the behaviour changes (for example, where the parabola stops crossing the x-axis and just touches it).
4. Narrow the slider range or type values directly to land on the exact value.
5. **Confirm with algebra** (here, discriminant b² − 36 = 0 gives b = 6 for b > 0).

**Why confirm.** A slider shows you the neighbourhood of the answer; algebra pins it exactly. Together they take less time than either alone on a hard question, and the slider protects you from setting up the wrong equation.

**Slider settings.** Click the slider's limits to change the range and step. For SAT questions, a range of −20 to 20 with step 0.5 or 1 usually finds the neighbourhood quickly.

## Move 4: "No solution" and "infinitely many solutions" with sliders
**Routine for linear systems.**
1. Enter `3x + ay = 7` and `6x - 4y = 5`, accepting a slider for a.
2. Drag a until the lines look parallel (no intersection).
3. Confirm with coefficient ratios: 3/6 must equal a/(−4), so a = −2. The constants are not in the same ratio, so the lines are distinct and the system has no solution.

If the lines ever lie exactly on top of each other, the system has infinitely many solutions; that only happens when the constants also share the ratio.

## Move 5: Inequalities and test points
**Routine.**
1. Enter each inequality: `y > 2x - 3` and `y <= -x + 6`. Desmos shades each region; the overlap is the solution set. Use `<=` or `>=` for "or equal to".
2. To test a candidate point from the answer choices, type it as a point, for example `(1, 4)`.
3. A point inside the doubly shaded region satisfies both inequalities.

**Example.** The point (1, 4) satisfies both: 4 > −1 and 4 ≤ 5. The point (3, 2) fails the first inequality, because 2 is not greater than 3. Dashed boundary lines mean the boundary is excluded; solid lines mean it is included.

**Upper-module variant.** "Which point is a solution to the system?" Type all four answer points at once; only one lands in the overlap.

## Move 6: Restrictions with curly brackets
Desmos lets you restrict where a graph is drawn by adding conditions in curly brackets at the end of an expression.

- `y = 2x {0 < x < 3}` draws the line only for x between 0 and 3.
- `y = x^2 - 4 {x >= 0}` draws only the right half of the parabola.

**SAT uses.**
- Modelling questions with a stated domain ("for 0 ≤ t ≤ 10").
- Piecewise reasoning, by graphing each piece with its own restriction.
- Removing clutter: restrict a curve so only the relevant intersection remains.

## Move 7: Equivalent expressions by overlay
**Routine.**
1. Graph the original expression, for example `y = (x^2 - 9)/(x - 3)`.
2. Graph each answer choice on its own line.
3. The equivalent choice draws directly on top of the original. Toggle graphs on and off (click the coloured circle) to see which coincides.

**Caution: holes.** (x² − 9)/(x − 3) and x + 3 look identical on the graph, but the first is undefined at x = 3. If a question asks about values where an expression is *defined*, the overlay alone is not enough; check the restrictions algebraically.

**Speed tip.** Instead of graphing, test with a number. Defining x itself as a number would change every graph on the screen, so use a different letter: define `t = 2.7`, then type the original expression and each choice with t in place of x and compare the values. Pick an unusual test value (not 0, 1 or 2), because special values can make non-equivalent expressions agree by coincidence.

## Move 8: Reading features of quadratics and other models
**Routine.**
1. Graph the function.
2. Click the curve. Desmos shows the turning point (vertex), the x-intercepts and the y-intercept as grey dots.
3. Click each dot for coordinates.

**Uses.** Maximum height of a projectile model, minimum cost, break-even points, and "which equation has a graph with vertex (h, k)" questions, where you graph each choice and click.

**Define and evaluate functions.** Type `f(x) = 3x^2 - 2` and `g(x) = 2x + 1`, then type `f(g(2))`. Desmos returns 73. This removes composition errors entirely.

## Move 9: Linear regression from a table
Some data questions give a table and ask for the line of best fit, a predicted value or the meaning of a slope.

**Routine.**
1. Add a table (from the add-item menu) and enter the x-values in the first column and y-values in the second. Desmos names the columns x₁ and y₁.
2. On a new line, type `y1 ~ m x1 + b`. Desmos shows the 1s as subscripts; if your keyboard does not convert them, type `y_1 ~ m x_1 + b`.
3. Desmos reports the fitted values of m and b and a measure of fit (r²).

**Example data:** x = 1, 2, 3, 4, 5 and y = 3.1, 4.9, 7.2, 8.8, 11.1. The fit gives m = 1.99, b = 1.05 and r² about 0.997. A predicted value at x = 8 is 1.99 × 8 + 1.05 = 16.97.

**Interpretation questions.** The slope is the predicted change in y for each one-unit increase in x; the intercept is the predicted y when x = 0 (which may be outside the data and meaningless in context).

## Move 10: Regressions with constraints
The tilde (~) fits any model you write, and you can constrain the model in two ways.

**Constraint by form.** Leave out a term you know is zero. If a question says a quantity is proportional to another, fit `y1 ~ m x1` (a line through the origin). On the data above, this gives m about 2.28, a different slope from the unconstrained fit, which is exactly why form matters.

**Constraint by range.** The Desmos help documentation shows parameter restrictions written in curly brackets after the model, such as `y1 ~ a x1^b {1 < b < 5}`. The calculator then searches only within that range. Use this when context rules out values (a decay factor must be between 0 and 1; a growth rate must be positive).

**Exponential example.** Data (0, 200), (1, 180), (2, 162), (3, 145.8). Fit `y1 ~ a b^x1 {0 < b < 1}`. Desmos returns a = 200 and b = 0.9, so the model is y = 200(0.9)ˣ: an initial value of 200 decreasing by 10% per step.

**Exact fit from three points.** A quadratic `y1 ~ a x1^2 + b x1 + c` fitted to exactly three points passes through all of them. For (0, 5), (1, 2) and (3, 2) it gives a = 1, b = −4, c = 5: the parabola y = x² − 4x + 5 with vertex (2, 1). This answers "which equation passes through these points" in seconds.

## Move 11: List statistics
**Routine.**
1. Create a list with square brackets: `L = [12, 15, 15, 18, 20, 22, 26]`.
2. Type `mean(L)`, `median(L)`, `min(L)`, `max(L)` on separate lines.
3. For spread, `stdev(L)` gives the sample standard deviation and `stdevp(L)` the population standard deviation.

For this list: mean ≈ 18.29, median 18.

**Compare two data sets.** Replace 26 with 60 in a second list, `M = [12, 15, 15, 18, 20, 22, 60]`. The median stays 18, the mean rises to about 23.14 and the sample standard deviation jumps from about 4.79 to about 16.60. This is the classic SAT outlier question, answered by typing rather than reasoning from slogans.

**Frequency tables.** For values V = [1, 2, 3, 4] with frequencies F = [3, 5, 8, 4], the mean is `total(V F)/total(F)` (Desmos multiplies lists element by element), which gives 53/20 = 2.65. For the median, use cumulative counts: there are 20 values, the 10th and 11th both fall in the group with value 3, so the median is 3.

**SAT note.** Most SAT spread questions ask you to *compare* standard deviations, not compute them. Desmos lets you confirm a comparison in seconds when the data are given numerically.

## Move 12: Circles and other implicit equations
Desmos graphs equations in x and y without solving for y.

**Routine.**
1. Type the circle exactly as given, for example `x^2 + y^2 - 8x + 6y - 11 = 0`.
2. Click the leftmost, rightmost, top and bottom points. The centre is midway between opposite points; the radius is half the distance across.
3. For intersections with a line, add the line and click the intersections.

**Example.** The circle (x − 4)² + (y + 3)² = 36 and the line y = x − 1 meet at (4, 3) and (−2, −3). Both points satisfy the circle equation.

**Still learn the algebra.** "What is the radius?" is faster by completing the square once you are fluent, and some questions give the circle in a form with parameters, where Desmos needs sliders.

## Move 13: Checking student-produced responses
Desmos is an excellent final check for SPR answers.

- **Convert fractions:** type `7/12` to see 0.58333... Then apply the Bluebook entry rules: up to 5 characters for a positive answer, 6 for a negative answer, with long decimals truncated or rounded at the fourth digit.
- **Substitute back:** define `t = -7/12` and type the original equation's left side with t; confirm it equals the right side.
- **Catch sign errors:** graph both sides and confirm the intersection's x-coordinate has the sign you entered.

## Move 14: Maximum, minimum and "for what value" questions in context
Many modelling questions ask when a quantity is largest or smallest, or when it reaches a given value.

**Routine.**
1. Graph the model with the variable names changed to x and y, for example `y = -4.9x^2 + 19.6x + 2` for a height model.
2. Click the curve to find the maximum point: here (2, 21.6), so the maximum height is 21.6 when x = 2.
3. For "when does the height equal 10?", add `y = 10` and click the intersections.
4. Restrict to the meaningful domain with curly brackets, for example `{x >= 0}`, so you do not report a negative time.

**Interpretation check.** Always translate the coordinates back into the question's words: x was time, y was height. Many wrong answers come from reporting the wrong coordinate of the right point.

## Worked example: one hard question, three routes
**Question (original).** The function g is defined by g(x) = x² − 10x + c, where c is a constant. If the minimum value of g is −7, what is g(2)?

**Route A: algebra.** Completing the square, g(x) = (x − 5)² + (c − 25). The minimum is c − 25 = −7, so c = 18. Then g(2) = 4 − 20 + 18 = **2**.

**Route B: slider.** Type `g(x) = x^2 - 10x + c`, accept the slider for c, click the vertex and drag c until the vertex reads (5, −7). The slider stops at c = 18. Type `g(2)` and read 2.

**Route C: vertex shortcut plus Desmos check.** The vertex of x² − 10x + c is at x = 5 (half of 10). So g(5) = 25 − 50 + c = −7 gives c = 18. Type `g(2)` with c = 18 to confirm.

**Which route is best?** For a student fluent in completing the square, Route A or C takes under a minute. Route B is a safe fallback when the algebra looks messy. The real skill is choosing in the first five seconds.

## When not to use Desmos
Desmos costs time to type. Skip it when:

- The equation is linear and short (two steps of algebra are faster than typing).
- The question asks for an expression in terms of other variables ("solve for h in terms of V and r").
- The question is about **interpreting** a model (what does 0.9 represent?), where no graph helps.
- The arithmetic is simple and typing risks a transcription error.

**The 30-second rule:** if you can write a correct algebraic solution in about 30 seconds, do it, then use Desmos only if time remains to check.

## Common Desmos errors and fixes
| Error | Symptom | Fix |
|---|---|---|
| Fraction captures too much | Typing `1/2x` puts 2x in the denominator | Press the right arrow after the 2 to leave the fraction, or type `(1/2)x` |
| Wrong angle mode | Trig values look strange | Check degrees/radians in settings |
| Leftover expressions | Extra intersections | Clear the screen per question |
| Window too small | "No intersection" | Zoom out or zoom-fit |
| Defining x as a number | Other graphs disappear or change | Use a different letter (t, u) |
| Estimating instead of clicking | Off-by-a-little answers | Click points for coordinates |

## A practice routine for building speed
Typing fluency matters as much as knowing the moves.

- **Week 1:** 10 minutes a day running Moves 1–4 on Algebra and Advanced Math items from the [SAT Practice Bank](https://practice.sat.schood.online/bank). Time each question and write whether Desmos or algebra was faster.
- **Week 2:** Moves 5–8 on mixed medium and hard items.
- **Week 3:** Moves 9–12 on data and geometry items in Problem-Solving and Data Analysis and Geometry and Trigonometry.
- **Week 4:** full 22-question timed Math modules, deciding *before each question* whether to open Desmos. Review the decisions afterwards.

Then test under real conditions in a full mock in the [SAT simulator](https://sat.schood.online).

## Self-check {checklist}
- I can solve any single-variable equation by graphing both sides.
- I can find and count intersections of linear and nonlinear systems.
- I use sliders to locate a parameter value and confirm it with algebra.
- I can shade a system of inequalities and test answer-choice points.
- I can restrict a graph's domain with curly brackets.
- I can test equivalent expressions by overlay and know the hole caveat.
- I can fit linear, exponential and quadratic models with the tilde.
- I can constrain a regression by form and by parameter range.
- I can compute mean, median and standard deviation from a list.
- I know when typing into Desmos is slower than algebra.

## Where to go next
- Apply these moves to the traps in [Math Hard-Module Traps](/guide-math-hard-module-traps).
- Revisit [Math: Problem-Solving and Data Analysis](/math-problem-solving-data-analysis) for the statistics concepts behind Move 11.
- For pacing, see [Pacing and Adaptive Modules](/pacing-and-adaptive-modules).

## Independent tool notice {callout: About Desmos}
Desmos is a third-party calculator embedded in Bluebook by the College Board. Schood is not affiliated with Desmos or the College Board. Feature descriptions here follow Desmos's public help pages; the version in Bluebook is what counts on test day.
