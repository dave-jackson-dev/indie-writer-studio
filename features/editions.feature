Feature: Editions of a Work

  As an author
  I want to track the Editions of each Work
  So that I know which revision is current and which have been superseded

  Background:
    Given Ada has a work titled "The Salt Road"

  Scenario: The first Edition is number 1 and starts as a draft
    When Ada adds an edition to "The Salt Road"
    Then the outcome is a success
    And "The Salt Road" has these editions:
      | number | label     | status |
      | 1      | Edition 1 | draft  |

  Scenario: Editions are numbered consecutively and can be labelled
    Given Ada has added an edition to "The Salt Road"
    When Ada adds an edition to "The Salt Road" labelled "Second Edition, revised"
    Then "The Salt Road" has these editions:
      | number | label                   | status |
      | 1      | Edition 1               | draft  |
      | 2      | Second Edition, revised | draft  |

  Scenario: Publishing an Edition records the date it was published
    Given Ada has added an edition to "The Salt Road"
    When Ada publishes edition 1 of "The Salt Road" on "2026-11-02"
    Then the outcome is a success
    And edition 1 of "The Salt Road" is "published" on "2026-11-02"

  Scenario: Publishing a newer Edition supersedes the one that was published
    Given Ada has added an edition to "The Salt Road"
    And Ada has added an edition to "The Salt Road"
    And Ada has published edition 1 of "The Salt Road" on "2026-11-02"
    When Ada publishes edition 2 of "The Salt Road" on "2027-03-15"
    Then "The Salt Road" has these editions:
      | number | label     | status     |
      | 1      | Edition 1 | superseded |
      | 2      | Edition 2 | published  |
    And "The Salt Road" has exactly 1 published edition

  Scenario: An Edition cannot be published twice
    Given Ada has added an edition to "The Salt Road"
    And Ada has published edition 1 of "The Salt Road" on "2026-11-02"
    When Ada publishes edition 1 of "The Salt Road" on "2026-12-01"
    Then the outcome is an error with code "EDITION_CONFLICT"
    And the exit code is 3
    And edition 1 of "The Salt Road" is "published" on "2026-11-02"

  Scenario: A superseded Edition cannot be published again
    Given Ada has added an edition to "The Salt Road"
    And Ada has added an edition to "The Salt Road"
    And Ada has published edition 1 of "The Salt Road" on "2026-11-02"
    And Ada has published edition 2 of "The Salt Road" on "2027-03-15"
    When Ada publishes edition 1 of "The Salt Road" on "2027-04-01"
    Then the outcome is an error with code "EDITION_CONFLICT"

  Scenario: Publishing an Edition that does not exist is refused
    When Ada publishes edition 7 of "The Salt Road" on "2026-11-02"
    Then the outcome is an error with code "EDITION_NOT_FOUND"
    And the exit code is 5

  Scenario Outline: A publication date must be a real calendar date
    Given Ada has added an edition to "The Salt Road"
    When Ada publishes edition 1 of "The Salt Road" on "<date>"
    Then the outcome is an error with code "INVALID_EDITION"
    And the exit code is 2

    Examples:
      | date       |
      | 2026-02-30 |
      | 1900-02-29 |
      | 02/11/2026 |
      | tomorrow   |

  Scenario: A leap day is accepted in a leap year, including the century leap year
    Given Ada has added an edition to "The Salt Road"
    When Ada publishes edition 1 of "The Salt Road" on "2000-02-29"
    Then edition 1 of "The Salt Road" is "published" on "2000-02-29"

  Scenario: An Edition cannot be added to a Work that does not exist
    When Ada adds an edition to the work with id "no-such-work"
    Then the outcome is an error with code "WORK_NOT_FOUND"

  Scenario: The Editions of a Work are listed in number order
    Given Ada has added an edition to "The Salt Road"
    And Ada has added an edition to "The Salt Road"
    When Ada lists the editions of "The Salt Road"
    Then the edition listing shows these numbers:
      | number |
      | 1      |
      | 2      |

  Scenario: Removing a Work removes its Editions
    Given Ada has added an edition to "The Salt Road"
    When Ada removes the work "The Salt Road"
    Then the catalog is empty

  @restart
  Scenario: Editions survive the app being restarted
    Given Ada has added an edition to "The Salt Road"
    And Ada has published edition 1 of "The Salt Road" on "2026-11-02"
    When the app is restarted
    Then edition 1 of "The Salt Road" is "published" on "2026-11-02"
