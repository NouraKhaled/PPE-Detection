------------------------------------------------------------
  CONTENTS OF THIS CD
------------------------------------------------------------

2_Source_Code/
        - Complete source code of the project.
        - Includes the React + TypeScript frontend and the
          Python backend (server.py).
        - The trained YOLO weight file (best.pt) is NOT
          included on this CD because of its size (~50 MB).
          Download it from the Google Drive link below and
          place it inside lab_safety_system3/models/ before
          running the system:

          https://drive.google.com/file/d/1pK2wdbhnFk1L6g90vGUZQKo4sn8nFMa7/view?usp=sharing

3_Tools_and_Software/
    tools.txt
        - Full list of free software, IDEs, libraries, and
          download links used during development.

4_Setup_Guide/
    SETUP_GUIDE.md
        - Step-by-step beginner-friendly instructions for
          future students who want to recreate, run, or
          extend the project. Covers Python, Node.js, VS
          Code, the database, and how to retrain the YOLO
          model on Kaggle.
    dataset.txt
        - Information about the public dataset used to
          train the YOLO model, including the source URL,
          license, and citation. The dataset itself is not
          shipped on this CD.

README.txt
    - This file.


------------------------------------------------------------
  HOW TO USE THIS CD
------------------------------------------------------------

1. Download the trained model file (best.pt) from the
   Google Drive link in the 2_Source_Code section above
   and place it inside:
       2_Source_Code/lab_safety_system3/models/best.pt

2. To rebuild the working system on a new computer, follow
   4_Setup_Guide/SETUP_GUIDE.md from start to finish.

3. To install only the tools, refer to
   3_Tools_and_Software/tools.txt for download links.

4. To retrain the model, see dataset.txt for the dataset
   source and Section 11 of SETUP_GUIDE.md for the Kaggle
   training instructions.


------------------------------------------------------------
  QUICK SUMMARY
------------------------------------------------------------

The Intelligent Lab Safety System monitors a chemistry lab
in real time. A computer-vision model (YOLOv11) detects
whether each person is wearing the required Personal
Protective Equipment (PPE) — lab coat, gloves, goggles, and
mask. Environmental sensors on a Raspberry Pi measure gas
concentration and temperature. A web dashboard shows the
live camera feed, sensor readings, gas-valve state, alerts,
and a complete event log; supervisors can register accounts,
sign in, and export logs.

============================================================
