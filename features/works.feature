Feature: The works catalog

  As an author
  I want a catalog of my Works
  So that I can see what I am writing and where each Work stands

  Scenario: Adding a Work puts it in the catalog as a draft
    When Ada adds a work titled "The Salt Road"
    Then the outcome is a success
    And the work "The Salt Road" is a draft
    And the catalog lists the works:
      | title         |
      | The Salt Road |

  Scenario: A Work can carry a subtitle and a synopsis
    When Ada adds a work titled "The Salt Road" with subtitle "A Novel" and synopsis "Two sisters cross a desert."
    Then the work "The Salt Road" has subtitle "A Novel"
    And the work "The Salt Road" has synopsis "Two sisters cross a desert."

  Scenario: Surrounding spaces in a title are ignored
    When Ada adds a work titled "  The Salt Road  "
    Then the catalog lists the works:
      | title         |
      | The Salt Road |

  Scenario: A Work needs a title
    When Ada adds a work titled ""
    Then the outcome is an error with code "INVALID_WORK"
    And the exit code is 2
    And the catalog is empty

  Scenario: A title of only spaces is no title
    When Ada adds a work titled "   "
    Then the outcome is an error with code "INVALID_WORK"
    And the catalog is empty

  Scenario: A title cannot be longer than 200 characters
    When Ada adds a work with a title of 201 characters
    Then the outcome is an error with code "INVALID_WORK"
    And the catalog is empty

  Scenario: Ada can retitle a Work and describe it
    Given Ada has a work titled "The Salt Road"
    When Ada updates the work "The Salt Road" with title "Salt Road" and synopsis "A revised blurb."
    Then the work "Salt Road" has synopsis "A revised blurb."
    And the catalog lists the works:
      | title     |
      | Salt Road |

  Scenario: An empty subtitle clears it
    Given Ada has a work titled "The Salt Road" with subtitle "A Novel"
    When Ada updates the work "The Salt Road" with subtitle ""
    Then the work "The Salt Road" has no subtitle

  Scenario: A Work moves through its statuses
    Given Ada has a work titled "The Salt Road"
    When Ada marks the work "The Salt Road" as "in-progress"
    Then the work "The Salt Road" is "in-progress"
    When Ada marks the work "The Salt Road" as "complete"
    Then the work "The Salt Road" is "complete"

  Scenario: Only the known statuses are accepted
    Given Ada has a work titled "The Salt Road"
    When Ada marks the work "The Salt Road" as "abandoned"
    Then the outcome is an error with code "INVALID_WORK"
    And the work "The Salt Road" is a draft

  Scenario: The catalog can be filtered by status
    Given Ada has a work titled "The Salt Road"
    And Ada has a work titled "Glass Harbour"
    And Ada has marked the work "Glass Harbour" as "complete"
    When Ada lists the works with status "complete"
    Then the catalog listing shows the works:
      | title         |
      | Glass Harbour |

  Scenario: The catalog lists Works in the order they were added
    Given Ada has a work titled "Glass Harbour"
    And Ada has a work titled "The Salt Road"
    Then the catalog lists the works:
      | title         |
      | Glass Harbour |
      | The Salt Road |

  Scenario: Asking for a Work that does not exist is refused
    When Ada asks for the work with id "no-such-work"
    Then the outcome is an error with code "WORK_NOT_FOUND"
    And the exit code is 5

  Scenario: Removing a Work takes it out of the catalog
    Given Ada has a work titled "The Salt Road"
    When Ada removes the work "The Salt Road"
    Then the outcome is a success
    And the catalog is empty

  Scenario: Removing a Work that does not exist is refused
    When Ada removes the work with id "no-such-work"
    Then the outcome is an error with code "WORK_NOT_FOUND"

  @restart
  Scenario: The catalog survives the app being restarted
    Given Ada has a work titled "The Salt Road"
    When the app is restarted
    Then the catalog lists the works:
      | title         |
      | The Salt Road |
