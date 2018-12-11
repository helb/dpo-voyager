/**
 * 3D Foundation Project
 * Copyright 2018 Smithsonian Institution
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import ExplorerSystem from "../core/ExplorerSystem";
import RenderQuadView from "@ff/three/ecs/RenderQuadView";
import ManipTarget from "@ff/browser/ManipTarget";

import QuadSplitter from "./QuadSplitter";
import CustomElement, { customElement } from "@ff/ui/CustomElement";

////////////////////////////////////////////////////////////////////////////////

export interface IResizeEvent extends CustomEvent
{
    detail: {
        width: number;
        height: number;
    }
}

@customElement("sv-content-layer")
export default class ContentLayer extends CustomElement
{
    static readonly resizeEvent: string = "sv-resize";

    protected system: ExplorerSystem;
    protected manipTarget: ManipTarget;

    protected view: RenderQuadView = null;
    protected canvas: HTMLCanvasElement = null;
    protected overlay: HTMLDivElement = null;
    protected splitter: QuadSplitter = null;

    constructor(system: ExplorerSystem)
    {
        super();

        this.onResize = this.onResize.bind(this);

        this.system = system;
        this.manipTarget = new ManipTarget();

        this.addEventListener("pointerdown", this.manipTarget.onPointerDown);
        this.addEventListener("pointermove", this.manipTarget.onPointerMove);
        this.addEventListener("pointerup", this.manipTarget.onPointerUpOrCancel);
        this.addEventListener("pointercancel", this.manipTarget.onPointerUpOrCancel);
        this.addEventListener("wheel", this.manipTarget.onWheel);
    }

    protected firstConnected()
    {
        this.canvas = this.createElement("canvas", {
            display: "block",
            width: "100%",
            height: "100%"
        }, this);

        this.overlay = this.createElement("div", {
            position: "absolute",
            top: "0", bottom: "0", left: "0", right: "0",
            overflow: "hidden"
        }, this);

        this.splitter = new QuadSplitter().setStyle({
            position: "absolute",
            top: "0", bottom: "0", left: "0", right: "0",
            overflow: "hidden"
        }).appendTo(this);
    }

    protected connected()
    {
        this.view = new RenderQuadView(this.system, this.canvas, this.overlay);
        this.manipTarget.next = this.view;

        window.addEventListener("resize", this.onResize);
        this.onResize();
    }

    protected disconnected()
    {
        this.view.dispose();
        this.view = null;
        this.manipTarget.next = null;

        window.removeEventListener("resize", this.onResize);
    }

    protected onResize()
    {
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;

        if (this.view) {
            this.view.resize(width, height);
        }

        this.dispatchEvent(new CustomEvent(ContentLayer.resizeEvent, {
            detail: { width, height }
        } as IResizeEvent));
    }
}