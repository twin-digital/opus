# Spec Delta

## MODIFIED Requirements

### Requirement: The application writes a screenshot when the picture changes

With the argument `--shots <folder>`, after each drawing that follows a `welcome` or a new part `store`, the application SHALL write the rendered image of the viewport as a PNG file with a number that goes up by 1, and show `wishem-godot: shot <n> seq <seq> color <color> file <path>`. `<color>` is the pixel at the center. The command SHALL copy each file to `nodejs/wishem/renderer-godot/shots/`, which it empties at its start, and `<path>` is the absolute path of the copy.

#### Scenario: The copy of a file fails

- **WHEN** the command cannot copy the file of shot 3
- **THEN** the terminal shows `wishem-godot: shot 3 could not be copied` and no shot line for shot 3

#### Scenario: The first picture

- **WHEN** the application connects to a construct that starts paused
- **THEN** the terminal shows `wishem-godot: shot 1 seq 0 color #1d4ed8 file <absolute path of shots/0001.png>`, and each pixel of `shots/0001.png` is `#1d4ed8`

#### Scenario: The construct is paused

- **WHEN** the construct is paused and no input arrives for 1500 milliseconds
- **THEN** the application writes no new screenshot

## ADDED Requirements

### Requirement: The application writes no file with no --shots

With no argument `--shots`, the application SHALL write no screenshot file. After each drawing that follows a `welcome` or a new part `store`, it SHALL show `wishem-godot: picture <n> seq <seq> color <color>`, where `<n>` goes up by 1 and `<color>` is the pixel at the center of the rendered image.

#### Scenario: The first picture with no shots

- **WHEN** the application runs with no `--shots` and connects to a construct that starts paused
- **THEN** the terminal shows `wishem-godot: picture 1 seq 0 color #1d4ed8`, and the folder `user://shots` does not exist

### Requirement: The application can be exported as a pack with the views of a product

A program SHALL be able to export the Godot application as one pack, with the Godot views of a folder that the program gives in the place of `godot/views/`, in the pinned Docker image. The pack SHALL hold no file of `godot/tests/`. Godot 4.7.2 SHALL run the pack with `--main-pack` and the arguments `--link` and `--shots` of the application.

#### Scenario: The pack draws the sample construct

- **WHEN** a program exports the pack with the views of `godot/views/` and Godot runs it in the image with `--link` of a paused sample construct
- **THEN** the terminal shows `wishem-godot: picture 1 seq 0 color #1d4ed8`

#### Scenario: The pack holds no test

- **WHEN** a program lists the files of the pack
- **THEN** no path starts with `res://tests/`
