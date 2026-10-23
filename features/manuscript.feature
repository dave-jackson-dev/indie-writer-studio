Feature: The manuscript

  As an author of fiction and nonfiction
  I CAN build my Work's text as parts, chapters, scenes and sections
  So that I can draft, reorder and count the book while it is still taking shape

  Background:
    Given Ada has a work titled "The Salt Road"

  Scenario: A new Work has an empty manuscript
    Then the outline of "The Salt Road" is empty
    And the manuscript of "The Salt Road" has 0 words

  Scenario: Fiction is drafted as parts, chapters and scenes
    When Ada adds a part "Part One" to the main matter of "The Salt Road"
    And Ada adds a chapter "The Crossing" under "Part One" in "The Salt Road"
    And Ada adds a scene "Dawn at the well" under "The Crossing" in "The Salt Road"
    And Ada adds a scene "The first mile" under "The Crossing" in "The Salt Road"
    Then the outline of "The Salt Road" is:
      | matter | depth | kind    | title            |
      | main   | 0     | part    | Part One         |
      | main   | 1     | chapter | The Crossing     |
      | main   | 2     | scene   | Dawn at the well |
      | main   | 2     | scene   | The first mile   |

  Scenario: Nonfiction is drafted as chapters and nested sections
    When Ada adds a chapter "Why Salt Matters" to the main matter of "The Salt Road"
    And Ada adds a section "A short history" under "Why Salt Matters" in "The Salt Road"
    And Ada adds a section "Roman salaries" under "A short history" in "The Salt Road"
    Then the outline of "The Salt Road" is:
      | matter | depth | kind    | title            |
      | main   | 0     | chapter | Why Salt Matters |
      | main   | 1     | section | A short history  |
      | main   | 2     | section | Roman salaries   |

  Scenario: Front matter and back matter are kept apart from the main text
    When Ada adds a chapter "Dedication" to the front matter of "The Salt Road"
    And Ada adds a chapter "One" to the main matter of "The Salt Road"
    And Ada adds a section "Acknowledgments" to the back matter of "The Salt Road"
    Then the outline of "The Salt Road" is:
      | matter | depth | kind    | title           |
      | front  | 0     | chapter | Dedication      |
      | main   | 0     | chapter | One             |
      | back   | 0     | section | Acknowledgments |

  Scenario: A node is added at the end unless a position says otherwise
    Given Ada has added a chapter "Two" to the main matter of "The Salt Road"
    When Ada adds a chapter "One" to the main matter of "The Salt Road" at position 0
    And Ada adds a chapter "Three" to the main matter of "The Salt Road"
    Then the chapters in the main matter of "The Salt Road" are "One, Two, Three"

  Scenario Outline: The kinds nest only in the ways a book allows
    Given Ada has a <parent kind> "Parent" in "The Salt Road"
    When Ada adds a <child kind> "Child" under "Parent" in "The Salt Road"
    Then the outcome is an error with code "INVALID_PLACEMENT"
    And the exit code is 2
    And "Parent" in "The Salt Road" has no children

    Examples:
      | parent kind | child kind |
      | scene       | scene      |
      | scene       | section    |
      | part        | scene      |
      | part        | part       |
      | chapter     | part       |
      | chapter     | chapter    |
      | section     | chapter    |
      | section     | scene      |

  Scenario Outline: What each kind may hold is accepted
    Given Ada has a <parent kind> "Parent" in "The Salt Road"
    When Ada adds a <child kind> "Child" under "Parent" in "The Salt Road"
    Then the outcome is a success

    Examples:
      | parent kind | child kind |
      | part        | chapter    |
      | part        | section    |
      | chapter     | scene      |
      | chapter     | section    |
      | section     | section    |

  Scenario Outline: Front and back matter hold no parts or scenes at the top level
    When Ada adds a <kind> "Item" to the <matter> matter of "The Salt Road"
    Then the outcome is an error with code "INVALID_PLACEMENT"

    Examples:
      | matter | kind  |
      | front  | part  |
      | back   | part  |
      | front  | scene |
      | back   | scene |

  Scenario: A scene cannot stand alone in the main text
    When Ada adds a scene "Loose scene" to the main matter of "The Salt Road"
    Then the outcome is an error with code "INVALID_PLACEMENT"

  Scenario: A node needs a title
    When Ada adds a chapter "   " to the main matter of "The Salt Road"
    Then the outcome is an error with code "INVALID_NODE"
    And the exit code is 2

  Scenario: Only the four kinds exist
    When Ada adds a node of kind "act" titled "Act One" to the main matter of "The Salt Road"
    Then the outcome is an error with code "INVALID_NODE"

  Scenario: A parent that does not exist is refused
    When Ada adds a chapter "Orphan" under the node with id "no-such-node" in "The Salt Road"
    Then the outcome is an error with code "NODE_NOT_FOUND"
    And the exit code is 5

  Scenario: A position past the end is refused
    When Ada adds a chapter "Far" to the main matter of "The Salt Road" at position 4
    Then the outcome is an error with code "INVALID_PLACEMENT"

  Scenario: The text of a node is Markdown kept exactly as written
    Given Ada has added a chapter "One" to the main matter of "The Salt Road"
    When Ada writes this text in "One" of "The Salt Road":
      """
      # Salt

      The *first* line.
        An indented line.
      """
    Then the text of "One" in "The Salt Road" is:
      """
      # Salt

      The *first* line.
        An indented line.
      """

  Scenario: Words are counted per node and for everything beneath it
    Given Ada has added a chapter "One" to the main matter of "The Salt Road"
    And Ada has added a scene "Dawn" under "One" in "The Salt Road"
    And Ada has written "one two three" in "One" of "The Salt Road"
    And Ada has written "four five" in "Dawn" of "The Salt Road"
    Then "One" in "The Salt Road" has 3 words of its own and 5 in all
    And "Dawn" in "The Salt Road" has 2 words of its own and 2 in all
    And the manuscript of "The Salt Road" has 5 words

  Scenario: Renaming a node keeps its place and its text
    Given Ada has added a chapter "One" to the main matter of "The Salt Road"
    And Ada has written "some words" in "One" of "The Salt Road"
    When Ada renames "One" to "Prologue" in "The Salt Road"
    Then the outline of "The Salt Road" is:
      | matter | depth | kind    | title    |
      | main   | 0     | chapter | Prologue |
    And "Prologue" in "The Salt Road" has 2 words of its own and 2 in all

  Scenario: A chapter can be moved to another part
    Given Ada has added a part "Part One" to the main matter of "The Salt Road"
    And Ada has added a part "Part Two" to the main matter of "The Salt Road"
    And Ada has added a chapter "Wanderer" under "Part One" in "The Salt Road"
    When Ada moves "Wanderer" under "Part Two" in "The Salt Road"
    Then the outline of "The Salt Road" is:
      | matter | depth | kind    | title    |
      | main   | 0     | part    | Part One |
      | main   | 0     | part    | Part Two |
      | main   | 1     | chapter | Wanderer |

  Scenario: A node moves with everything beneath it
    Given Ada has added a chapter "One" to the main matter of "The Salt Road"
    And Ada has added a scene "Dawn" under "One" in "The Salt Road"
    And Ada has added a chapter "Two" to the main matter of "The Salt Road"
    When Ada moves "One" to the main matter of "The Salt Road" at position 1
    Then the outline of "The Salt Road" is:
      | matter | depth | kind    | title |
      | main   | 0     | chapter | Two   |
      | main   | 0     | chapter | One   |
      | main   | 1     | scene   | Dawn  |

  Scenario: A node can be moved from the main text into the back matter
    Given Ada has added a chapter "Epilogue" to the main matter of "The Salt Road"
    When Ada moves "Epilogue" to the back matter of "The Salt Road"
    Then the outline of "The Salt Road" is:
      | matter | depth | kind    | title    |
      | back   | 0     | chapter | Epilogue |

  Scenario: A node cannot be moved into itself or beneath itself
    Given Ada has added a part "Part One" to the main matter of "The Salt Road"
    And Ada has added a chapter "One" under "Part One" in "The Salt Road"
    When Ada moves "Part One" under "One" in "The Salt Road"
    Then the outcome is an error with code "INVALID_PLACEMENT"
    And the outline of "The Salt Road" is:
      | matter | depth | kind    | title    |
      | main   | 0     | part    | Part One |
      | main   | 1     | chapter | One      |

  Scenario: A move that breaks the nesting rules is refused and changes nothing
    Given Ada has added a chapter "One" to the main matter of "The Salt Road"
    And Ada has added a scene "Dawn" under "One" in "The Salt Road"
    When Ada moves "Dawn" to the main matter of "The Salt Road"
    Then the outcome is an error with code "INVALID_PLACEMENT"
    And the outline of "The Salt Road" is:
      | matter | depth | kind    | title |
      | main   | 0     | chapter | One   |
      | main   | 1     | scene   | Dawn  |

  Scenario: Removing a node removes everything beneath it
    Given Ada has added a chapter "One" to the main matter of "The Salt Road"
    And Ada has added a scene "Dawn" under "One" in "The Salt Road"
    And Ada has added a chapter "Two" to the main matter of "The Salt Road"
    When Ada removes "One" from "The Salt Road"
    Then the outline of "The Salt Road" is:
      | matter | depth | kind    | title |
      | main   | 0     | chapter | Two   |

  Scenario: Removing a node that does not exist is refused
    When Ada removes the node with id "no-such-node" from "The Salt Road"
    Then the outcome is an error with code "NODE_NOT_FOUND"

  Scenario: Each Work has its own manuscript
    Given Ada has a work titled "Glass Harbour"
    And Ada has added a chapter "One" to the main matter of "The Salt Road"
    Then the outline of "Glass Harbour" is empty

  Scenario: A work id that could escape the data directory is refused
    When Ada asks for the outline of the work with id "../../etc"
    Then the outcome is an error with code "INVALID_WORK_ID"
    And the exit code is 2

  @restart
  Scenario: The manuscript survives the app being restarted
    Given Ada has added a chapter "One" to the main matter of "The Salt Road"
    And Ada has written "one two three" in "One" of "The Salt Road"
    When the app is restarted
    Then the outline of "The Salt Road" is:
      | matter | depth | kind    | title |
      | main   | 0     | chapter | One   |
    And the manuscript of "The Salt Road" has 3 words
