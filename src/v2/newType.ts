export type NewType<T, NewTypeName> = T & {
    /**
     * This is not available at runtime
     */
    readonly __COMPILETIME_TYPE__: NewTypeName;
};
