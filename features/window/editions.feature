Feature: The Writer window - Editions

  As an author
  I CAN see and publish the Editions of a Work in the Writer window
  So that I know which revision is the one readers have

  Background:
    Given Ada has opened the Writer
    And Ada has a work titled "The Salt Road" in the window

  Scenario: A Work with no Editions says so
    When Ada selects the work "The Salt Road"
    Then the Editions panel shows no editions

  Scenario: Ada can add an Edition
    When Ada selects the work "The Salt Road"
    And Ada adds an edition labelled "First pass" in the window
    Then the Editions panel shows edition 1 "First pass" as "draft"

  Scenario: Publishing an Edition supersedes the one before it
    Given Ada has added the editions "First pass" and "Second pass" to the work "The Salt Road" in the window
    When Ada publishes edition 1 on "2026-03-01" in the window
    And Ada publishes edition 2 on "2026-04-01" in the window
    Then the Editions panel shows edition 1 "First pass" as "superseded"
    And the Editions panel shows edition 2 "Second pass" as "published"

  Scenario: A publication date must be a real date
    Given Ada has added the editions "First pass" to the work "The Salt Road" in the window
    When Ada publishes edition 1 on "2026-02-30" in the window
    Then a notice says "date"
    And the Editions panel shows edition 1 "First pass" as "draft"

  Scenario: The catalog counts the Editions Ada adds
    When Ada selects the work "The Salt Road"
    And Ada adds an edition labelled "First pass" in the window
    Then the catalog shows 1 edition for the work "The Salt Road"

  Scenario: Publishing with no date does not reuse the last date typed
    Given Ada has added the editions "First pass" and "Second pass" to the work "The Salt Road" in the window
    When Ada publishes edition 1 on "2026-03-01" in the window
    And Ada publishes edition 2 without a date in the window
    Then the Editions panel shows edition 2 as published on a date other than "2026-03-01"
