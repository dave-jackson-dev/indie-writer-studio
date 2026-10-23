Feature: System health

  As an author running IndieWriter Studio
  I want to know the service is up and which components it composed
  So that I can trust the app before I start writing

  Scenario: The service reports that it is healthy
    When Ada checks the system health
    Then the outcome is a success
    And the system reports status "ok" for service "indie-writer"

  Scenario: The service lists the components it composed
    When Ada checks the system health
    Then the system reports the component "works"

  Scenario: An unknown operation is refused by name
    When Ada runs the operation "nothing.here"
    Then the outcome is an error with code "UNKNOWN_OPERATION"
