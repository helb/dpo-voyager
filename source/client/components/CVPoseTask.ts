/**
 * 3D Foundation Project
 * Copyright 2019 Smithsonian Institution
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

import * as THREE from "three";

import { Node, types } from "@ff/graph/Component";

import Viewport from "@ff/three/Viewport";

import RenderQuadView, { EQuadViewLayout, IPointerEvent } from "@ff/scene/RenderQuadView";
import CRenderer from "@ff/scene/components/CRenderer";

import NVNode from "../nodes/NVNode";

import CVModel2 from "./CVModel2";
import CVTask from "./CVTask";
import CVScene, { IBoundingBoxEvent } from "./CVScene";

import PoseTaskView from "../ui/story/PoseTaskView";
import CVDocument from "./CVDocument";

////////////////////////////////////////////////////////////////////////////////

const _vec3a = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _quat0 = new THREE.Quaternion();
const _quat1 = new THREE.Quaternion();
const _boundingBox = new THREE.Box3();
const _size = new THREE.Vector3();

export enum EPoseManipMode { Off, Translate, Rotate }

/**
 * Provides tools for editing the pose of a model or part.
 * Corresponding view: [[PoseTaskView]].
 *
 * Listens to viewport pointer events to provide interactive move and rotate tools.
 */
export default class CVPoseTask extends CVTask
{
    static readonly typeName: string = "CVPoseTask";

    static readonly text: string = "Pose";
    static readonly icon: string = "move";

    protected static readonly ins = {
        mode: types.Enum("Pose.Mode", EPoseManipMode, EPoseManipMode.Off)
    };
    protected static readonly outs = {
        size: types.Vector3("Model.Size")
    };

    ins = this.addInputs<CVTask, typeof CVPoseTask.ins>(CVPoseTask.ins);
    outs = this.addOutputs<CVTask, typeof CVPoseTask.outs>(CVPoseTask.outs);

    private _viewport: Viewport = null;
    private _deltaX = 0;
    private _deltaY = 0;

    protected activeModel: CVModel2 = null;

    constructor(node: Node, id: string)
    {
        super(node, id);

        const configuration = this.configuration;
        configuration.gridVisible = true;
        configuration.annotationsVisible = false;
        configuration.interfaceVisible = false;
        configuration.bracketsVisible = true;
    }

    protected get renderer() {
        return this.getMainComponent(CRenderer);
    }

    createView()
    {
        return new PoseTaskView(this);
    }

    activateTask()
    {
        // start listening to pointer events for interactive move/rotate tools
        this.system.on<IPointerEvent>(["pointer-down", "pointer-up", "pointer-move"], this.onPointer, this);

        // switch to quad view layout
        this.renderer.views.forEach(view => {
            if (view instanceof RenderQuadView) {
                view.layout = EQuadViewLayout.Quad;
            }
        });

        // start observing active node and active document changes
        this.startObserving();

        super.activateTask();
    }

    deactivateTask()
    {
        super.deactivateTask();

        // stop observing active node and active document changes
        this.stopObserving();

        // switch back to single view layout
        this.renderer.views.forEach(view => {
            if (view instanceof RenderQuadView) {
                view.layout = EQuadViewLayout.Single;
            }
        });

        // stop listening to pointer events for interactive move/rotate tools
        this.system.off<IPointerEvent>(["pointer-down", "pointer-up", "pointer-move"], this.onPointer, this);
    }

    update(context)
    {
        // mode property has changed
        return true;
    }

    tick()
    {
        if (!this.isActiveTask) {
            return false;
        }

        const mode = this.ins.mode.value;

        if (mode === EPoseManipMode.Off || !this.activeModel) {
            return false;
        }

        const deltaX = this._deltaX;
        const deltaY = this._deltaY;

        if (deltaX === 0 && deltaY === 0) {
            return false;
        }

        this._deltaX = this._deltaY = 0;

        const camera = this._viewport.camera;

        if (!camera || !camera.isOrthographicCamera) {
            return false;
        }

        camera.matrixWorld.decompose(_vec3a, _quat0, _vec3a);

        if (mode === EPoseManipMode.Rotate) {
            // convert accumulated pointer movement to rotation angle
            const angle = (deltaX - deltaY) * 0.002;

            // generate rotation matrix
            _axis.set(0, 0, -1).applyQuaternion(_quat0);
            _quat1.setFromAxisAngle(_axis, angle);
            _mat4.makeRotationFromQuaternion(_quat1);
        }
        else {
            // transform pointer movement to world scale, generate translation matrix
            const f = camera.size / this._viewport.height;
            _axis.set(deltaX * f, -deltaY * f, 0).applyQuaternion(_quat0);
            _mat4.identity().setPosition(_axis);
        }

        // multiply delta transform with current model pose transform
        _mat4.multiply(this.activeModel.object3D.matrix);
        this.activeModel.setFromMatrix(_mat4);

        return true;
    }

    protected onActiveDocument(previous: CVDocument, next: CVDocument)
    {
        super.onActiveDocument(previous, next);

        if (previous) {
            previous.innerGraph.getComponent(CVScene).off("bounding-box", this.onModelBoundingBox, this);
        }
        if (next) {
            next.innerGraph.getComponent(CVScene).on("bounding-box", this.onModelBoundingBox, this);
        }
    }

    protected onActiveNode(previous: NVNode, next: NVNode)
    {
        this.activeModel = next && next.model;

        if (this.activeModel) {
            this.selection.selectComponent(this.activeModel);
            this.onModelBoundingBox();
        }
    }

    protected onModelBoundingBox()
    {
        if (this.activeModel) {
            _boundingBox.makeEmpty();
            _boundingBox.expandByObject(this.activeModel.object3D);
            _boundingBox.getSize(_size);
            _size.toArray(this.outs.size.value);
            this.outs.size.set();
        }
        console.log("on bounding box");
    }

    protected onPointer(event: IPointerEvent)
    {
        if (this.ins.mode.value === EPoseManipMode.Off || !this.activeModel) {
            return;
        }

        // check pointer events if left button is down
        if (event.originalEvent.buttons === 1) {

            if (event.type === "pointer-move") {
                // modify speed multiplier according to modifier keys pressed (ctrl = 0.1, shift = 10)
                const speed = event.ctrlKey ? 0.1 : (event.shiftKey ? 10 : 1);

                // accumulate motion in deltaX/deltaY
                this._deltaX += event.movementX * speed;
                this._deltaY += event.movementY * speed;
                this._viewport = event.viewport;

                // mark event as handled
                event.stopPropagation = true;
            }
        }
    }
}