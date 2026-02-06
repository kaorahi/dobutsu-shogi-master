import {AI} from "./ai";
import "./bootstrap";
import {UI} from "./ui";
//@ts-ignore
import ai_txt from "../../precomp/unpruned_ai.txt?raw";

new UI(new AI(ai_txt));
