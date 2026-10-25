Feature: The Writer window - the works catalog

  As an author
  I CAN keep my catalog in the Writer window
  So that I never need a terminal to see what I am writing and where each Work stands

  Background:
    Given Ada has opened the Writer

  Scenario: The window opens on an empty catalog
    Then the window is titled "IndieWriter Studio"
    And the catalog shows no works
    And the catalog invites Ada to add her first Work

  Scenario: Ada can add a Work from the window
    When Ada adds the work "The Salt Road" with subtitle "A Novel" in the window
    Then the catalog shows the work "The Salt Road" as "draft"
    And the catalog shows the subtitle "A Novel" for the work "The Salt Road"

  Scenario: A Work needs a title, and the window says so
    When Ada adds the work "" in the window
    Then a notice says "title"
    And the catalog shows no works

  Scenario: Ada can change a Work's status
    Given Ada has a work titled "The Salt Road" in the window
    When Ada marks the work "The Salt Road" as "in-progress" in the window
    Then the catalog shows the work "The Salt Road" as "in-progress"

  Scenario: Ada can retitle a Work
    Given Ada has a work titled "The Salt Road" in the window
    When Ada retitles the work "The Salt Road" to "Salt Road" in the window
    Then the catalog shows the work "Salt Road" as "draft"
    And the catalog does not show the work "The Salt Road"

  Scenario: Ada can filter the catalog by status
    Given Ada has a work titled "The Salt Road" in the window
    And Ada has a work titled "Glass Harbour" in the window
    And Ada marks the work "Glass Harbour" as "complete" in the window
    When Ada filters the catalog by "complete"
    Then the catalog shows only the works:
      | title         |
      | Glass Harbour |

  Scenario: Removing a Work asks Ada to confirm first
    Given Ada has a work titled "The Salt Road" in the window
    When Ada asks to remove the work "The Salt Road" but cancels
    Then the catalog shows the work "The Salt Road" as "draft"
    When Ada removes the work "The Salt Road" and confirms
    Then the catalog shows no works

  Scenario: The catalog survives the window being closed and reopened
    Given Ada has a work titled "The Salt Road" in the window
    When Ada closes the Writer and opens it again
    Then the catalog shows the work "The Salt Road" as "draft"
