import subprocess
import json
import time

thread_id = 'thread_1786576304649_69e7c056'

# Read current lessons to preserve status and verify IDs
path_cmd = [
    'python3', '/home/mahmud/.hermes/skills/workflow/learning-compass-site-operator/scripts/site_request.py',
    'request', 'GET', f'/learning/core/threads/{thread_id}/path', '--raw'
]
path_data = json.loads(subprocess.check_output(path_cmd).decode('utf-8'))

lessons_meta = {}
for s in path_data['stages']:
    for l in s['lessons']:
        lessons_meta[l['id']] = {
            'stage_title': s['title'],
            'title': l['title'],
            'status': l.get('status', 'not_started')
        }

print(f"Loaded {len(lessons_meta)} existing lessons in thread")

lesson_content = {
    # =========================================================================
    # LEVEL 0: Orientation (7 lessons)
    # Goal: Paradigm shift from reductionist event-reacting to structural inquiry
    # =========================================================================
    "lesson_path_item_1786576305170_7ff12be7": {
        "title": "What systems thinking is",
        "why_learn": "Traditional reductionism breaks systems into isolated components and fails when problems arise from interactions, non-linearities, and feedback. Systems thinking provides the foundational lens to see wholes, causal interconnections, and structural drivers rather than isolated events.",
        "why_now": "Before learning formal modeling tools, stocks, flows, or simulation mathematics, you need the overarching mental shift from linear blame-assigning and firefighting to structural diagnostic inquiry.",
        "takeaway": "An operational definition of a system (elements, interconnections, and purpose/function) and the diagnostic habit of asking 'what structural architecture produced this behavior?' instead of 'who caused this event?'"
    },
    "lesson_path_item_1786576305356_47bb5906": {
        "title": "Bottlenecks",
        "why_learn": "Throughput in any multi-stage system is governed exclusively by its narrowest constraint (Goldratt's Theory of Constraints). Optimizing non-bottlenecks creates local excess inventory, exhausts resources, and generates zero systemic throughput gains.",
        "why_now": "Establishes constraint identification immediately after defining a system, so you learn to locate the active rate-limiting factor before proposing operational interventions.",
        "takeaway": "How to locate the true system bottleneck, subordinate all upstream and downstream processes to its cadence, and exploit systemic capacity without accidental sub-optimization."
    },
    "lesson_path_item_1786576305547_76335f6a": {
        "title": "Feedback loops",
        "why_learn": "Cause and effect in real systems do not operate in one-way open chains; outputs feed back as future inputs. Feedback loops explain runaway exponential momentum (reinforcing) and persistent equilibrium or resistance to change (balancing).",
        "why_now": "Understanding circular causality is the prerequisite for moving from static component analysis to dynamic behavior over time.",
        "takeaway": "The ability to trace closed circular causality, identify reinforcing loops (growth/decay engines) and balancing loops (goal-seeking stabilizers), and recognize that system structure dictates behavior."
    },
    "lesson_path_item_1786576305705_a6597233": {
        "title": "Leverage points",
        "why_learn": "In complex systems, intuitive interventions usually produce low leverage or pushback, while high-leverage intervention points are counterintuitive and often fiercely resisted.",
        "why_now": "Introduces the concept of leverage early so that every subsequent modeling and mapping exercise is focused on finding high-impact intervention points rather than tinkering with trivial parameters.",
        "takeaway": "An introductory understanding of Meadows' leverage hierarchy: recognizing why pushing harder on parameters yields diminishing returns, while altering feedback loops, information flows, and system goals transforms performance."
    },
    "lesson_path_item_1786576305871_c89cb642": {
        "title": "Second-order effects",
        "why_learn": "Most policy and organizational failures occur because decision-makers optimize for immediate, visible first-order payoffs while remaining blind to the delayed second- and third-order systemic repercussions that often reverse the original gains.",
        "why_now": "Builds the essential cognitive reflex of 'and then what?' before analyzing multi-loop feedback structures and delayed responses.",
        "takeaway": "The disciplined habit of tracing downstream consequences across time horizons and organizational boundaries to anticipate unintended side effects before taking action."
    },
    "lesson_path_item_1786576306785_19cfee01": {
        "title": "Modeling exercise",
        "why_learn": "Systems thinking is a craft internalized through active diagramming and boundary selection, not passive conceptual reading.",
        "why_now": "Solidifies the orientation concepts (purpose, elements, constraint, feedback, and delays) by mapping a tangible real-world system immediately.",
        "takeaway": "A complete, validated sketch of a real everyday system showing boundary, core stock, driving flow, dominant feedback loop, and key delay."
    },
    "lesson_path_item_1786576306971_738dda8e": {
        "title": "One real-world application",
        "why_learn": "The ultimate test of systems thinking is whether it uncovers a misdiagnosed root cause or hidden constraint in your actual work or life.",
        "why_now": "Closes Level 0 by translating conceptual orientation into a grounded diagnostic audit of an active operational challenge.",
        "takeaway": "A documented diagnosis of a recurring personal or organizational pathology showing how treating symptoms exacerbated the underlying structural issue."
    },

    # =========================================================================
    # LEVEL 1: Foundations (10 lessons)
    # Goal: Master structural anatomy—stocks, flows, boundaries, and mental models
    # =========================================================================
    "lesson_path_item_1786576307477_cca500e2": {
        "title": "What counts as a system",
        "why_learn": "Not every collection of parts is a system. Confusing a mere heap/collection (e.g., sand pile, list of tasks) with an integrated system (e.g., digestive tract, software pipeline) leads to flawed analytical methods.",
        "why_now": "Establishes rigorous criteria for system identification before decomposing components, boundaries, and mathematical relationships.",
        "takeaway": "The three non-negotiable criteria of a true system: distinct elements, causal interconnections, and an overarching purpose or characteristic behavior."
    },
    "lesson_path_item_1786576307701_852eaac7": {
        "title": "Elements, relationships, and purpose",
        "why_learn": "Changing system elements has the least impact; changing relationships has moderate impact; changing the purpose/function completely alters system behavior.",
        "why_now": "Understand the structural hierarchy of system components before drawing formal boundary lines and stock-flow networks.",
        "takeaway": "The ability to identify the true operational purpose of a system (revealed by what it consistently produces, not stated intentions) and how relational structures dictate performance."
    },
    "lesson_path_item_1786576307891_8aa20010": {
        "title": "System boundaries",
        "why_learn": "Boundaries are mental constructs, not physical truths. Drawing boundaries too narrowly creates blind spots and externalized costs; drawing them too broadly makes analysis intractable.",
        "why_now": "You must consciously choose what to include, exclude, and hold exogenous before modeling feedback dynamics.",
        "takeaway": "A systematic method for setting analytical boundaries that contain the feedback mechanisms causing the problem without unnecessary noise."
    },
    "lesson_path_item_1786576308101_e41683f4": {
        "title": "Structure versus events",
        "why_learn": "Event-level thinking leads to reactive firefighting and blaming individuals; structural thinking uncovers the underlying rules, delays, and loops that generate those events.",
        "why_now": "Transition from descriptive observation of symptoms to structural diagnosis of generative system architecture.",
        "takeaway": "Mastery of the Systems Iceberg model: distinguishing Events (what happened), Patterns of Behavior (trends over time), and Systemic Structure (the design creating the patterns)."
    },
    "lesson_path_item_1786576308278_1aefe328": {
        "title": "Stocks and flows",
        "why_learn": "Stocks (accumulations) are the state and memory of a system; flows (rates) are the activities that change stocks over time. Confusing stocks with flows is the #1 source of dynamic intuition failure (the Bathtub Fallacy).",
        "why_now": "Stocks and flows provide the formal, rigorous language required for all quantitative modeling and simulation.",
        "takeaway": "Clear identification of accumulations (inventory, trust, knowledge, debt) versus rates (inflows/outflows), and understanding why stocks decouple inflows from outflows."
    },
    "lesson_path_item_1786576308492_efc01414": {
        "title": "Patterns over time",
        "why_learn": "Static snapshots hide trajectory, momentum, and inflection points. Graphing behavior over time reveals the signature archetypes of dynamic behavior.",
        "why_now": "Connects stock accumulations to visual time series data before analyzing complex loop interactions.",
        "takeaway": "Proficiency in constructing and interpreting Behavior-Over-Time Graphs (BOTGs) to detect exponential growth, S-curves, oscillations, and stability."
    },
    "lesson_path_item_1786576308721_80388df8": {
        "title": "Mental models",
        "why_learn": "All decisions are based on mental models, which are simplified internal representations of how the world works. Flawed mental models produce systemic blind spots.",
        "why_now": "Recognize how subjective assumptions filter and distort perception before building explicit causal models.",
        "takeaway": "Techniques for surfacing, testing, and updating hidden mental models and aligning team mental models through shared structural diagrams."
    },
    "lesson_path_item_1786576308937_57d9273a": {
        "title": "Linear versus systemic causality",
        "why_learn": "Linear causality assumes A causes B in isolation. Systemic causality recognizes that B also feeds back to influence A, often through delays and non-linear paths.",
        "why_now": "Crucial epistemological challenge to prevent reverting to linear root-cause thinking during complex modeling.",
        "takeaway": "The ability to critique linear explanations and construct closed causal loops showing bidirectional feedback and mutual influence."
    },
    "lesson_path_item_1786576309932_21993e58": {
        "title": "Modeling exercise",
        "why_learn": "Translates foundational concepts into a precise structural diagram combining boundaries, multiple stocks, flows, and closed feedback loops.",
        "why_now": "Consolidates Level 1 foundations before tackling advanced System Dynamics behaviors like delays, oscillations, and limit shifts in Level 2.",
        "takeaway": "A multi-stock, multi-flow system diagram with clear explicit boundaries and annotated feedback polarities for a real problem."
    },
    "lesson_path_item_1786576310148_3a99f8ad": {
        "title": "One real-world application",
        "why_learn": "Validates structural analysis against live empirical observations, demonstrating how structural misdiagnoses caused previous interventions to fail.",
        "why_now": "Closes Level 1 by applying foundational structural models to diagnose a live work or organizational situation.",
        "takeaway": "A written structural audit of an active problem identifying at least two overlooked stock accumulations and a hidden balancing loop."
    },

    # =========================================================================
    # LEVEL 2: System Dynamics (11 lessons)
    # Goal: Dynamic archetypes—exponential growth, limits, delays, and oscillations
    # =========================================================================
    "lesson_path_item_1786576310761_e58449c5": {
        "title": "Positive and negative feedback",
        "why_learn": "Reinforcing (positive) feedback drives explosive growth or destructive collapse; balancing (negative) feedback resists change, seeks equilibrium, and stabilizes systems.",
        "why_now": "Establishes the two fundamental dynamic building blocks that govern all system behavior over time.",
        "takeaway": "The ability to trace loop polarities, calculate net loop signs, and identify whether a loop amplifies or dampens perturbations."
    },
    "lesson_path_item_1786576311017_328d1767": {
        "title": "Reinforcing and balancing loops",
        "why_learn": "Real systems are networks where reinforcing loops generate momentum and balancing loops impose constraints, creating complex multi-loop interactions.",
        "why_now": "Understand how reinforcing and balancing mechanisms interact before introducing delays and nonlinearities.",
        "takeaway": "How to map coupled reinforcing-balancing systems (e.g., customer acquisition vs capacity constraints) and identify shifting loop dominance."
    },
    "lesson_path_item_1786576311221_c9aff6dd": {
        "title": "Delays",
        "why_learn": "Delays in material flow, perception, or decision-making cause systems to over-correct, overshoot targets, and oscillate violently.",
        "why_now": "Delays turn simple stable balancing loops into unstable oscillatory systems; understanding delays is essential before studying overshoot.",
        "takeaway": "Distinguishing material delays (pipeline transport, production) from information delays (reporting, perception), and methods to prevent over-adjustment."
    },
    "lesson_path_item_1786576311628_ed7ef6a2": {
        "title": "Nonlinear relationships",
        "why_learn": "In nonlinear systems, cause and effect are not proportional. A small change can cause a sudden catastrophic shift (tipping point), while a massive change may produce negligible results.",
        "why_now": "Linear approximations break down under stress; non-linearities explain sudden behavioral shifts and threshold effects.",
        "takeaway": "Identifying non-linear table functions, diminishing returns, threshold triggers, and catastrophic tipping points in feedback systems."
    },
    "lesson_path_item_1786576311842_3031d6c2": {
        "title": "Exponential growth",
        "why_learn": "Exponential growth starts deceptively slowly and accelerates explosively, consistently fooling human linear intuition until resources are overwhelmed.",
        "why_now": "Study pure reinforcing feedback dynamics before examining how carrying capacities and balancing loops arrest growth.",
        "takeaway": "Understanding doubling times (Rule of 70), compound accumulation mechanics, and how early interventions prevent uncontrollable runaway dynamics."
    },
    "lesson_path_item_1786576312119_015b2779": {
        "title": "Limits to growth",
        "why_learn": "No physical system can grow exponentially forever. When growth encounters carrying capacity, balancing loops inevitably take over, creating S-shaped growth or overshoot.",
        "why_now": "Combines reinforcing growth loops with balancing constraint loops to analyze realistic life-cycle trajectories.",
        "takeaway": "The Limits to Growth system archetype: how to identify the limiting constraint early and invest in capacity before growth halts."
    },
    "lesson_path_item_1786576312330_c622ba7e": {
        "title": "Oscillation",
        "why_learn": "Oscillation (boom-bust cycles, inventory bullwhip, price cycles) is the classic signature of negative feedback with significant delays in perception or action.",
        "why_now": "Deepens the study of delays by analyzing sustained, expanding, and damped oscillatory behavior modes.",
        "takeaway": "Mathematical and behavioral mechanics of oscillation, identifying phase lags, and stabilizing oscillating systems by shortening delays or damping response aggressiveness."
    },
    "lesson_path_item_1786576312587_703cd536": {
        "title": "Overshoot and collapse",
        "why_learn": "When an accelerating system exceeds its carrying capacity and permanently degrades the underlying resource base, growth turns into sudden, irreversible collapse.",
        "why_now": "The critical high-stakes dynamic mode where delay in corrective action destroys the system's supporting environment.",
        "takeaway": "The structural difference between sustainable S-shaped adjustment (resilient carrying capacity) and overshoot-and-collapse (erodible carrying capacity)."
    },
    "lesson_path_item_1786576312803_db058f86": {
        "title": "Policy resistance",
        "why_learn": "Well-intentioned policies frequently fail or backfire because actors within the system adapt their behavior to preserve their own local goals, defeating the central policy.",
        "why_now": "Explains why simple interventions fail dynamically before moving into formal mathematical modeling and simulation in Level 3.",
        "takeaway": "How to map compensating feedback loops that neutralize interventions and design policies that align with the system's internal incentives."
    },
    "lesson_path_item_1786576314019_e07c80e6": {
        "title": "Modeling exercise",
        "why_learn": "Builds a complete dynamic hypothesis explaining a growing, oscillating, or plateauing behavior mode over time.",
        "why_now": "Synthesizes Level 2 dynamic concepts (loops, delays, limits) into an actionable structural hypothesis.",
        "takeaway": "A dynamic hypothesis document mapping the exact shift in loop dominance that drives a system from growth to saturation or oscillation."
    },
    "lesson_path_item_1786576314228_072214e9": {
        "title": "One real-world application",
        "why_learn": "Tests your ability to diagnose a live, complex dynamic pathology (e.g., inventory bullwhip, hiring boom-bust, product adoption plateau) in the wild.",
        "why_now": "Completes Level 2 by applying dynamic system diagnostic tools to a tangible real-world case study.",
        "takeaway": "A detailed diagnostic report of a real boom-bust or plateauing phenomenon identifying the exact delays, feedback loops, and carrying capacity constraints."
    },

    # =========================================================================
    # LEVEL 3: Modeling (10 lessons)
    # Goal: Formal simulation, stock-flow equations, calibration, and validation
    # =========================================================================
    "lesson_path_item_1786576315025_5bf29b44": {
        "title": "Behavior-over-time graphs",
        "why_learn": "BOTGs serve as the empirical reference mode for formal modeling, anchoring model development to observed historical data patterns.",
        "why_now": "Establishes the reference mode and quantitative timeline before formalizing equations and simulation models.",
        "takeaway": "How to define precise reference modes showing historical behavior and hypothesized future paths for all key system variables."
    },
    "lesson_path_item_1786576315268_ba489c33": {
        "title": "Causal-loop diagrams",
        "why_learn": "CLDs provide an intuitive qualitative map of feedback structures, capturing hypotheses about loop dominance and causal interactions.",
        "why_now": "Develops the high-level qualitative architecture of the system before specifying quantitative mathematical stock-flow equations.",
        "takeaway": "Standards and best practices for rigorous CLD construction: unambiguous variable naming, explicit link polarities, loop identifiers, and delay markings."
    },
    "lesson_path_item_1786576315582_feb5ed55": {
        "title": "Stock-and-flow diagrams",
        "why_learn": "CLDs cannot be simulated directly because they blur the distinction between accumulations and rates. Stock-and-flow diagrams provide the mathematical rigor needed for computational simulation.",
        "why_now": "Bridges qualitative loop intuition with formal differential/difference equation simulation models.",
        "takeaway": "How to construct fully specified stock-and-flow networks with clear physical conservation laws, information links, and auxiliary converters."
    },
    "lesson_path_item_1786576315818_b68de4a0": {
        "title": "Basic simulation",
        "why_learn": "Human mental simulation fails completely on multi-loop nonlinear systems with delays. Numerical computational simulation reveals actual system behavior over time.",
        "why_now": "Learn numerical integration mechanics (Euler, RK4) and simulation time-stepping (DT) before testing complex validation hypotheses.",
        "takeaway": "Setting up, running, and interpreting continuous-time dynamic simulations, choosing appropriate time steps (DT), and avoiding integration artifacts."
    },
    "lesson_path_item_1786576316146_affe1d44": {
        "title": "Model assumptions",
        "why_learn": "Every model is wrong, but some are useful. Being explicit about structural assumptions, exogenous inputs, and simplifications determines model credibility.",
        "why_now": "Critical discipline before calibrating parameters—ensuring the model's structural assumptions reflect reality rather than convenience.",
        "takeaway": "A structured Model Boundary and Assumptions Matrix documenting endogenous mechanisms, exogenous drivers, and omitted factors with explicit rationales."
    },
    "lesson_path_item_1786576316402_44a0e5be": {
        "title": "Calibration and validation",
        "why_learn": "Fitting parameters to historical data (curve fitting) does not prove structural validity. System Dynamics models require rigorous tests of structural and behavioral validity.",
        "why_now": "Master model validation tests before relying on simulation outputs for high-stakes policy recommendations.",
        "takeaway": "Yaman Barlas's formal validation suite: boundary adequacy tests, structure confirmation, extreme conditions tests, parameter verification, and behavior reproduction tests."
    },
    "lesson_path_item_1786576316705_8135908a": {
        "title": "Boundary criticism",
        "why_learn": "Model boundaries reflect values and power dynamics. Werner Ulrich's Critical Systems Heuristics (CSH) interrogates who benefits, who is harmed, and what is excluded.",
        "why_now": "Provides a vital epistemological and ethical critique of model boundaries before conducting sensitivity and policy analyses.",
        "takeaway": "Application of the 12 CSH boundary questions to uncover normative assumptions, unrepresented stakeholders, and externalized systemic costs."
    },
    "lesson_path_item_1786576316936_fc843a38": {
        "title": "Sensitivity analysis",
        "why_learn": "Real-world parameters are always uncertain. Sensitivity analysis reveals whether policy recommendations hold across parameter ranges or collapse under slight variations.",
        "why_now": "Distinguish numerical sensitivity (changes in exact values) from behavioral/policy sensitivity (changes in qualitative behavior mode or policy ranking).",
        "takeaway": "Conducting univariate and multivariate Monte Carlo sensitivity tests to identify high-risk leverage parameters and ensure policy robustness."
    },
    "lesson_path_item_1786576318426_b0a90d3c": {
        "title": "Modeling exercise",
        "why_learn": "Solidifies formal modeling by building, simulating, and stress-testing a complete stock-and-flow model from scratch.",
        "why_now": "Integrates all Level 3 modeling competencies (CLD, SFD, equations, simulation, extreme condition tests) in one unified workflow.",
        "takeaway": "A fully functional, simulated stock-and-flow model with validated equations, base-case run, and documented extreme condition test results."
    },
    "lesson_path_item_1786576318663_9f5b0701": {
        "title": "One real-world application",
        "why_learn": "Validates simulation modeling against real historical datasets and decision dilemmas in a professional or operational context.",
        "why_now": "Concludes Level 3 by proving that formal simulation models can reproduce historical behavior and uncover non-obvious policy implications.",
        "takeaway": "A complete modeling case report containing empirical calibration, sensitivity results, boundary critique, and policy design recommendations."
    },

    # =========================================================================
    # LEVEL 4: Leverage and Intervention (12 lessons)
    # Goal: Meadows' hierarchy, incentive redesign, rule restructuring, and change
    # =========================================================================
    "lesson_path_item_1786576319589_e755d5de": {
        "title": "Where intervention actually works",
        "why_learn": "Most interventions target parameters (subsidies, tax rates, headcounts), which represent the lowest leverage points in a system and produce minimal enduring change.",
        "why_now": "Introduces Donella Meadows' 12 Places to Intervene in a System to prioritize high-leverage architectural changes over low-leverage tweaks.",
        "takeaway": "The full 12-level leverage hierarchy from constants/parameters (lowest) to feedback loops, rules, information flows, system goals, and mindset paradigms (highest)."
    },
    "lesson_path_item_1786576319853_d4716879": {
        "title": "Why obvious solutions often fail",
        "why_learn": "Obvious, intuitive solutions usually address surface symptoms, triggering compensating balancing loops that restore the problem or shift the burden to another part of the system.",
        "why_now": "Unpack the structural reasons for intervention failure before redesigning incentives, rules, and paradigms.",
        "takeaway": "Identifying 'Shifting the Burden' and 'Fixes that Fail' archetypes to avoid symptomatic interventions that weaken internal system capability."
    },
    "lesson_path_item_1786576320223_895dbf12": {
        "title": "Delayed consequences",
        "why_learn": "Interventions that produce immediate benefits often carry long-delayed structural penalties, creating a dynamic trap known as 'Better-Before-Worse'.",
        "why_now": "Analyze temporal trade-offs before redesigning rules and incentives in complex human organizations.",
        "takeaway": "Mapping Better-Before-Worse dynamics and designing long-term guardrails that prevent premature abandonment of high-leverage strategies."
    },
    "lesson_path_item_1786576320494_51eaf469": {
        "title": "Unintended side effects",
        "why_learn": "There is no such thing as an isolated side effect—there are only systemic effects that cross arbitrary departmental or temporal boundaries.",
        "why_now": "Develop systematic scanning tools for cross-boundary feedback before implementing institutional rule changes.",
        "takeaway": "Constructing an Unintended Effects Matrix to trace how an intervention in Domain A creates feedback resistance in Domains B, C, and D."
    },
    "lesson_path_item_1786576320869_353c6d45": {
        "title": "Incentive redesign",
        "why_learn": "People respond to the incentives created by the system's structural rules, not to managerial exhortations. Perverse incentives (Kerr's Folly, Cobra Effect) guarantee counterproductive behavior.",
        "why_now": "Incentives are a mid-to-high leverage intervention that directly alters local feedback loops without changing overall technology.",
        "takeaway": "How to audit existing metric-incentive misalignments (Goodhart's Law) and redesign reward structures to incentivize global system health over local gaming."
    },
    "lesson_path_item_1786576321169_31694f49": {
        "title": "Rules and information flows",
        "why_learn": "Adding new information links (e.g., real-time feedback, public transparency) and changing operational rules is high leverage and remarkably inexpensive compared to physical capital investment.",
        "why_now": "Information restructuring is the fastest non-destructive mechanism to restore self-correcting feedback in failing institutions.",
        "takeaway": "Designing missing feedback links—delivering accurate, timely information directly to the actors whose decisions control the inflows and outflows."
    },
    "lesson_path_item_1786576321667_240c26bc": {
        "title": "Changing goals and paradigms",
        "why_learn": "The purpose/goal of a system dictates all lower-level rules, feedback loops, and stocks. Shifting the overarching goal or transcending the dominant paradigm produces massive transformation.",
        "why_now": "The pinnacle of Meadows' leverage hierarchy—understanding how mindset shifts unlock radical systemic redesign.",
        "takeaway": "Techniques for reframing system purpose, questioning deep-seated cultural/organizational dogmas, and operating with paradigm flexibility ('staying unattached to paradigms')."
    },
    "lesson_path_item_1786576321934_f068ea76": {
        "title": "Policy resistance",
        "why_learn": "Even high-leverage interventions trigger political, psychological, and organizational immune responses if stakeholders feel threatened by the reallocation of power or resources.",
        "why_now": "Prepare strategic change management and coalition-building defenses before launching real-world systemic interventions.",
        "takeaway": "Conducting a Stakeholder Power and Resistance Mapping exercise to design interventions that align with existing power structures or build new supportive coalitions."
    },
    "lesson_path_item_1786576323593_0f696701": {
        "title": "Modeling exercise",
        "why_learn": "Integrates symptoms, structure, incentives, rules, goals, and candidate leverage points into a comprehensive intervention matrix.",
        "why_now": "Practice mapping multi-level intervention options for a complex problem before deploying real-world tests.",
        "takeaway": "A completed Systemic Intervention Matrix evaluating at least 4 intervention points ranked by leverage, feasibility, and side-effect risk."
    },
    "lesson_path_item_1786576323864_c1f27d27": {
        "title": "One real-world application",
        "why_learn": "Proves your ability to design and execute a bounded, low-risk pilot intervention on a real system with clear leading indicators.",
        "why_now": "Validate intervention theory in practice before exploring domain-specific systems in Level 5.",
        "takeaway": "An executed bounded intervention experiment with baseline data, leading indicator tracking, observed pushback, and calibrated adjustments."
    },
    "lesson_path_item_1786576366051_e80eaaab": {
        "title": "Modeling exercise",
        "why_learn": "Advanced intervention modeling comparing competing policy packages across different stakeholder coalitions and time horizons.",
        "why_now": "Deepens intervention architecture by comparing single-point fixes against integrated multi-point policy bundles.",
        "takeaway": "A comparative intervention trade-off model showing the multi-year trajectory of low-leverage versus high-leverage policy bundles."
    },
    "lesson_path_item_1786576366484_8ef1b40c": {
        "title": "One real-world application",
        "why_learn": "Demonstrates long-term tracking of systemic change, observing how adaptive resistance emerges over time and adjusting rules accordingly.",
        "why_now": "Concludes Level 4 with rigorous evidence of real-world systemic change governance and iterative feedback adaptation.",
        "takeaway": "A post-intervention longitudinal review documenting initial gains, emerging secondary resistance, and second-stage structural adjustments."
    },

    # =========================================================================
    # LEVEL 5: Applied Systems Thinking (10 lessons)
    # Goal: Domain-specific systems—business, learning, productivity, markets, tech
    # =========================================================================
    "lesson_path_item_1786576324968_1caf4211": {
        "title": "Business and cash flow",
        "why_learn": "Financial bankruptcy is an operational stock-flow collapse where cash outflows exceed inflows despite accounting profitability. Business systems thinking links operational delays directly to working capital dynamics.",
        "why_now": "Apply formal system dynamics to core commercial reality—cash, working capital, customer acquisition loops, and capacity planning.",
        "takeaway": "Mapping and simulating the core cash-conversion cycle, growth traps (growing broke), and capacity investment feedback loops."
    },
    "lesson_path_item_1786576325273_e3e3bc41": {
        "title": "Learning Compass",
        "why_learn": "Knowledge acquisition, retention, and application form an interconnected cognitive system governed by decay stocks, retrieval flows, and focus allocation constraints.",
        "why_now": "Apply systems thinking directly to your personal learning operating system (Learning Compass) to optimize knowledge retention and compound intellectual capital.",
        "takeaway": "Structural map of the Learning Compass loop: capture flow, curation filtering, external consumption, structured reflection, FSRS spaced retrieval, and profile evolution."
    },
    "lesson_path_item_1786576325702_5bafd840": {
        "title": "Personal productivity",
        "why_learn": "Personal productivity is constrained by energy stocks, cognitive switching costs, and backlog accumulation. Treating productivity as linear task execution causes burnout.",
        "why_now": "Master internal energy and attention dynamics before analyzing external organizations and markets.",
        "takeaway": "Designing a personal operating system that balances recovery inflows with cognitive exertion outflows, managing work-in-progress (WIP) caps to maintain high throughput."
    },
    "lesson_path_item_1786576326008_5b11cc33": {
        "title": "Organizations and power",
        "why_learn": "Formal org charts describe hierarchy, but informal political networks, information asymmetries, and resource control dictate actual organizational behavior.",
        "why_now": "Understand the organizational power landscape before analyzing markets and public policy.",
        "takeaway": "Mapping power as an accumulating stock, identifying political feedback loops, and diagnosing bureaucratic defensiveness (Argyris's Model I behavior)."
    },
    "lesson_path_item_1786576326447_aebf0a80": {
        "title": "Relationships and small groups",
        "why_learn": "Interpersonal conflicts and family dynamics are reciprocal feedback loops, not one-sided moral failings (Bowen Family Systems Theory).",
        "why_now": "Extends systems thinking to human emotional systems, communication loops, and small-group dynamics.",
        "takeaway": "Identifying triangulation, reciprocal blame loops, emotional reactivity cycles, and applying de-triangulation to restore interpersonal equilibrium."
    },
    "lesson_path_item_1786576326761_68ed7c46": {
        "title": "Markets",
        "why_learn": "Financial and product markets are complex adaptive systems characterized by reflexivity (Soros), endogenous bubbles, and network effects, not static equilibrium.",
        "why_now": "Move from single-firm dynamics to multi-actor competitive and financial market ecosystems.",
        "takeaway": "Modeling market reflexivity: how market participants' biased expectations alter fundamentals, creating boom-bust speculative cycles and winner-take-all network dynamics."
    },
    "lesson_path_item_1786576327189_daa99885": {
        "title": "Technology systems",
        "why_learn": "Software architectures and technology platforms are sociotechnical systems where technical debt accumulates as a hidden stock, slowing feature velocity and compounding fragility.",
        "why_now": "Apply systems principles to digital architecture, APIs, developer velocity, and modular design.",
        "takeaway": "Modeling technical debt accumulation, modularity decoupling, and platform ecosystem loops (developers <-> users)."
    },
    "lesson_path_item_1786576327493_92a0bef2": {
        "title": "Public policy",
        "why_learn": "Public policy operates in high-complexity, multi-actor environments where regulatory interventions produce sprawling unintended social and economic consequences.",
        "why_now": "Synthesizes business, power, social, and economic systems to evaluate large-scale governance challenges.",
        "takeaway": "Applying multi-actor policy analysis to trace cross-sector feedback, regulatory capture, and long-term socioeconomic side effects."
    },
    "lesson_path_item_1786576329384_a3a355d3": {
        "title": "Modeling exercise",
        "why_learn": "Deepens domain mastery by constructing an integrated multi-sector case model in your specific field of expertise.",
        "why_now": "Proves that you can formulate and simulate an end-to-end domain model incorporating stakeholders, feedback, delays, and financial/operational flows.",
        "takeaway": "An integrated domain model (business, technology, or policy) with fully specified feedback equations and scenario simulations."
    },
    "lesson_path_item_1786576329677_83c961a4": {
        "title": "One real-world application",
        "why_learn": "Directly improves an active real-world operational decision using the domain model, recording empirical baseline, intervention, and results.",
        "why_now": "Completes Level 5 by delivering measurable, verified improvement to a live project or strategic decision.",
        "takeaway": "A documented before-and-after case study showing the systemic decision made, baseline metrics, observed outcomes, and unanticipated ripple effects."
    },

    # =========================================================================
    # LEVEL 6: Advanced Practice / Direction (11 lessons)
    # Goal: CAS, Viable System Model, Second-order cybernetics, network resilience
    # =========================================================================
    "lesson_path_item_1786576330865_b53aef81": {
        "title": "Formal system dynamics",
        "why_learn": "Advanced professional practice requires rigorous continuous differential equation formulation, eigenvalue stability analysis, and formal sensitivity testing.",
        "why_now": "Bridges intermediate simulation with advanced computational and analytical methods in mathematical system dynamics.",
        "takeaway": "Formulating multi-state nonlinear differential equations, analyzing Jacobian matrices, and conducting rigorous eigenvalue elasticity analysis to determine loop dominance."
    },
    "lesson_path_item_1786576331187_128a9140": {
        "title": "Complex adaptive systems",
        "why_learn": "CAS consists of diverse, decentralized agents that learn, adapt, and co-evolve, creating macroscopic emergent phenomena that cannot be modeled by aggregate differential equations alone.",
        "why_now": "Expands beyond deterministic system dynamics into emergence, adaptation, and bottom-up complexity science (Santa Fe Institute paradigm).",
        "takeaway": "Key CAS concepts: agent heterogeneity, local interaction rules, emergence, fitness landscapes, co-evolution, and edge-of-chaos dynamics."
    },
    "lesson_path_item_1786576331709_5fdd3920": {
        "title": "Viable systems",
        "why_learn": "Stafford Beer's Viable System Model (VSM) provides an invariant cybernetic architecture for autonomous, self-organizing systems that survive in volatile environments.",
        "why_now": "Connects cybernetic governance with organizational design and operational viability.",
        "takeaway": "The 5 sub-systems of VSM (Operations, Coordination, Control/Audit, Intelligence/Strategy, Policy/Identity) and how to design recursive organizational autonomy."
    },
    "lesson_path_item_1786576332029_51a154cf": {
        "title": "Cybernetics",
        "why_learn": "First-order cybernetics studies observed systems (control and feedback); second-order cybernetics studies observing systems (the role of the observer, self-reference, and epistemological reflexivity).",
        "why_now": "Deepens philosophical and epistemological maturity, recognizing how the analyst's own cognitive biases shape the modeling process.",
        "takeaway": "Ross Ashby's Law of Requisite Variety (only variety can absorb variety), Heinz von Foerster's second-order cybernetics, and self-referential autopoiesis (Maturana & Varela)."
    },
    "lesson_path_item_1786576332497_9217dc56": {
        "title": "Network science",
        "why_learn": "System structure is topological. Network science reveals how degree distributions (scale-free networks, power laws), clustering, and centrality determine systemic vulnerability to targeted attacks vs random failures.",
        "why_now": "Complements system dynamics by analyzing discrete topological structures and network propagation dynamics.",
        "takeaway": "Calculating network metrics (degree distribution, betweenness centrality, modularity) and predicting cascading contagion thresholds in scale-free and small-world networks."
    },
    "lesson_path_item_1786576332821_4a56f9e8": {
        "title": "Agent-based modeling",
        "why_learn": "ABM simulates individual autonomous agents following local behavioral rules, allowing macro-level social structures (segregation, market crashes, flocking) to emerge computationally from the bottom up.",
        "why_now": "The premier computational tool for modeling heterogeneous, spatial, and network-situated adaptive agents.",
        "takeaway": "Developing agent-based simulations (e.g., NetLogo/Mesa), defining agent state machines, interaction rules, and distinguishing generative explanations from curve-fitting."
    },
    "lesson_path_item_1786576333310_387d9582": {
        "title": "Resilience and systemic risk",
        "why_learn": "Optimizing for maximum efficiency strips out systemic buffers and redundancies, making tightly coupled systems hyper-fragile to catastrophic systemic contagion (Haldane & May).",
        "why_now": "Synthesizes networks, dynamics, and adaptive systems to design shock-absorbing, anti-fragile architectures.",
        "takeaway": "The structural trade-off between efficiency and resilience, identifying critical slowing down as an early warning signal of regime shifts, and designing modular decoupling buffers."
    },
    "lesson_path_item_1786576333645_cc5639ee": {
        "title": "Organizational learning",
        "why_learn": "Single-loop learning corrects errors within existing rules; double-loop learning questions and rewrites the underlying governing variables and assumptions. Most organizations are trapped in defensive single-loop routines.",
        "why_now": "Teaches how to institutionalize systemic inquiry and continuous double-loop reflexivity in human enterprises (Argyris, Schön, Senge).",
        "takeaway": "Diagnosing organizational defensive routines, facilitating productive double-loop inquiries, and designing systemic learning infrastructures."
    },
    "lesson_path_item_1786576334104_02b8376f": {
        "title": "Systems intervention ethics",
        "why_learn": "Intervening in complex human systems involves power, coercion, value conflicts, and unintended harms. Technocratic optimization without ethical boundaries is dangerous and illegitimate.",
        "why_now": "The crucial ethical capstone ensuring advanced systemic methods serve human dignity, justice, and stakeholder flourishing.",
        "takeaway": "West Churchman and Gerald Midgley's systemic intervention ethics: navigating conflicting value systems, addressing power asymmetries, and maintaining transparent moral accountability."
    },
    "lesson_path_item_1786576336128_c9d2e52a": {
        "title": "Modeling exercise",
        "why_learn": "Evaluates and compares different modeling paradigms (System Dynamics vs Agent-Based Modeling vs Network Analysis) on a single complex challenge to identify their respective strengths and blind spots.",
        "why_now": "Capstone modeling exercise demonstrating cross-paradigm fluency and methodological discernment.",
        "takeaway": "A comprehensive comparative modeling brief articulating exactly what each advanced lens (SD, ABM, Network) illuminates, assumes, and fails to capture."
    },
    "lesson_path_item_1786576336593_5a114646": {
        "title": "One real-world application",
        "why_learn": "Deploys advanced multi-paradigm systems practice to generate a testable, high-leverage strategic insight on an active complex problem while explicitly stating uncertainties and ethical risks.",
        "why_now": "The final capstone of the entire course thread, demonstrating full mastery from orientation to advanced practice.",
        "takeaway": "A master-level Systemic Strategic Architecture document integrating dynamic feedback, network topology, adaptive agent incentives, resilience buffers, and ethical boundary analysis."
    }
}

print(f"Total defined lesson contents: {len(lesson_content)}")
assert len(lesson_content) == 71, f"Expected 71 items, got {len(lesson_content)}"

# Execute PATCH for all 71 lessons in batches with logging
success = 0
for idx, (lid, content) in enumerate(lesson_content.items()):
    current_status = lessons_meta.get(lid, {}).get('status', 'not_started')
    patch_body = {
        'status': current_status,
        'why_learn': content['why_learn'],
        'why_now': content['why_now'],
        'takeaway': content['takeaway']
    }
    
    cmd = [
        'python3', '/home/mahmud/.hermes/skills/workflow/learning-compass-site-operator/scripts/site_request.py',
        'request', 'PATCH', f'/learning/core/threads/{thread_id}/lessons/{lid}', json.dumps(patch_body), '--raw'
    ]
    try:
        res = subprocess.check_output(cmd).decode('utf-8')
        success += 1
        print(f"[{idx+1:02d}/71] Updated '{content['title']}' ({lid}) -> OK")
    except Exception as e:
        print(f"[{idx+1:02d}/71] FAILED {lid}: {e}")

print(f"\n=======================================================")
print(f"Completed: {success}/71 lessons updated successfully in D1!")
print(f"=======================================================")
