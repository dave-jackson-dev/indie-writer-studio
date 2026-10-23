Feature: The Writer window - the manuscript outline

  As an author
  I CAN see and shape the outline of a Work's manuscript in the Writer window
  So that I can plan the structure before and while I write it

  Background:
    Given Ada has opened the Writer
    And Ada has a work titled "The Salt Road" in the window
    And Ada selects the work "The Salt Road"

  Scenario: A new Work has an empty outline
    Then the outline shows no sections

  Scenario: Ada can add a chapter
    When Ada adds a chapter titled "The Crossing" to the outline
    Then the outline shows "The Crossing" as a chapter

  Scenario: Ada can add a scene inside a chapter
    Given Ada has added a chapter titled "The Crossing" to the outline
    When Ada adds a scene titled "Dawn" under "The Crossing"
    Then the outline shows "Dawn" as a scene under "The Crossing"

  Scenario: The outline shows word counts
    Given Ada has added a chapter titled "The Crossing" with the text "Two sisters set out." to the outline
    Then the outline shows 4 words for "The Crossing"

  Scenario: Ada can remove a section with everything beneath it
    Given Ada has added a chapter titled "The Crossing" to the outline
    And Ada has added a scene titled "Dawn" under "The Crossing"
    When Ada removes "The Crossing" from the outline and confirms
    Then the outline shows no sections
